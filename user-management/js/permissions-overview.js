// =====================================================
// PERMISSIONS OVERVIEW MANAGER
// Quản lý Tab "Quyền Truy Cập" với Matrix và thống kê
// =====================================================

/**
 * PermissionsOverview - Hiển thị matrix User × Pages và thống kê permissions
 *
 * Dependencies: permissions-registry.js, user-management-enhanced.js
 */
class PermissionsOverview {
    constructor(containerId) {
        this.containerId = containerId;
        this.users = [];
        this.currentView = 'matrix'; // 'matrix', 'stats', 'detailed'
        this.filters = {
            role: 'all',
            page: 'all',
            search: ''
        };
    }

    /**
     * Lấy danh sách pages từ registry
     */
    getPages() {
        if (typeof PAGES_REGISTRY !== 'undefined') {
            return Object.values(PAGES_REGISTRY);
        }
        return [];
    }

    /**
     * Lấy categories
     */
    getCategories() {
        if (typeof PAGE_CATEGORIES !== 'undefined') {
            return Object.values(PAGE_CATEGORIES).sort((a, b) => a.order - b.order);
        }
        return [];
    }

    /**
     * Load và render overview
     */
    async load(usersData) {
        this.users = usersData || [];

        const container = document.getElementById(this.containerId);
        if (!container) return;

        container.innerHTML = this.render();

        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }
    }

    render() {
        const pages = this.getPages();
        const totalPerms = this.getTotalPermissionsCount();

        return `
            <div class="permissions-overview-container">
                <!-- Header with Stats -->
                <div class="overview-header">
                    <div class="overview-stats">
                        ${this.renderQuickStats()}
                    </div>
                </div>

                <!-- View Tabs -->
                <div class="overview-tabs">
                    <button class="tab-btn ${this.currentView === 'matrix' ? 'active' : ''}"
                            onclick="permissionsOverview.setView('matrix')">
                        <i data-lucide="table-2"></i>
                        Ma Trận Quyền Trang
                    </button>
                    <button class="tab-btn ${this.currentView === 'detailed' ? 'active' : ''}"
                            onclick="permissionsOverview.setView('detailed')">
                        <i data-lucide="shield-check"></i>
                        Quyền Chi Tiết
                    </button>
                    <button class="tab-btn ${this.currentView === 'stats' ? 'active' : ''}"
                            onclick="permissionsOverview.setView('stats')">
                        <i data-lucide="bar-chart-2"></i>
                        Thống Kê
                    </button>
                </div>

                <!-- Filters -->
                <div class="overview-filters">
                    <div class="filter-group">
                        <label><i data-lucide="filter"></i> Lọc theo:</label>
                        <select id="roleFilter" onchange="permissionsOverview.applyFilters()">
                            <option value="all">Tất cả vai trò</option>
                            <option value="0">Admin</option>
                            <option value="1">User</option>
                            <option value="2">Limited</option>
                            <option value="3">Basic</option>
                        </select>
                        <select id="pageFilter" onchange="permissionsOverview.applyFilters()">
                            <option value="all">Tất cả trang</option>
                            ${pages.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
                        </select>
                    </div>
                    <div class="filter-group">
                        <div class="search-input">
                            <i data-lucide="search"></i>
                            <input type="text" id="userSearchFilter" placeholder="Tìm user..."
                                   oninput="permissionsOverview.applyFilters()">
                        </div>
                    </div>
                    <div class="filter-actions">
                        <button class="btn btn-secondary" onclick="permissionsOverview.exportData()">
                            <i data-lucide="download"></i>
                            Xuất Excel
                        </button>
                    </div>
                </div>

                <!-- Content -->
                <div class="overview-content" id="overviewContent">
                    ${this.renderContent()}
                </div>
            </div>
        `;
    }

    renderQuickStats() {
        const pages = this.getPages();
        const totalPerms = this.getTotalPermissionsCount();

        // Calculate stats
        const roleStats = {};
        let totalPagePerms = 0;
        let totalDetailedPerms = 0;

        this.users.forEach(user => {
            // Use roleTemplate for grouping, fallback to checkLogin
            const roleInfo = this.getRoleTemplateInfo(user.roleTemplate);
            const role = roleInfo.name;
            roleStats[role] = (roleStats[role] || 0) + 1;

            // Derive page access from detailedPermissions (simplified system)
            if (user.detailedPermissions) {
                Object.entries(user.detailedPermissions).forEach(([pageId, pagePerms]) => {
                    const grantedCount = Object.values(pagePerms).filter(v => v === true).length;
                    totalDetailedPerms += grantedCount;
                    // User has access to page if at least one permission is true
                    if (grantedCount > 0) totalPagePerms++;
                });
            }
        });

        const avgPagePerms = this.users.length > 0 ? Math.round(totalPagePerms / this.users.length) : 0;
        const avgDetailedPerms = this.users.length > 0 ? Math.round(totalDetailedPerms / this.users.length) : 0;

        return `
            <div class="stat-card">
                <div class="stat-icon"><i data-lucide="users"></i></div>
                <div class="stat-info">
                    <div class="stat-value">${this.users.length}</div>
                    <div class="stat-label">Tổng Users</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon"><i data-lucide="layout-grid"></i></div>
                <div class="stat-info">
                    <div class="stat-value">${pages.length}</div>
                    <div class="stat-label">Trang trong hệ thống</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon"><i data-lucide="shield-check"></i></div>
                <div class="stat-info">
                    <div class="stat-value">${totalPerms}</div>
                    <div class="stat-label">Quyền chi tiết</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon"><i data-lucide="trending-up"></i></div>
                <div class="stat-info">
                    <div class="stat-value">${avgPagePerms}/${pages.length}</div>
                    <div class="stat-label">TB trang/user</div>
                </div>
            </div>
        `;
    }

    renderContent() {
        switch (this.currentView) {
            case 'matrix':
                return this.renderPageMatrix();
            case 'detailed':
                return this.renderDetailedStats();
            case 'stats':
                return this.renderRoleStats();
            default:
                return this.renderPageMatrix();
        }
    }

    renderPageMatrix() {
        const pages = this.getPages();
        const filteredUsers = this.getFilteredUsers();
        const categories = this.getCategories();

        if (filteredUsers.length === 0) {
            return `
                <div class="empty-state">
                    <i data-lucide="users"></i>
                    <h3>Không có dữ liệu</h3>
                    <p>Không tìm thấy user phù hợp với bộ lọc</p>
                </div>
            `;
        }

        // Group pages by category for header
        let headerHtml = '<tr><th class="sticky-col user-col">User</th><th class="role-col">Vai trò</th>';

        categories.forEach(cat => {
            const catPages = pages.filter(p => p.category === cat.id);
            if (catPages.length > 0) {
                headerHtml += `<th colspan="${catPages.length}" class="category-header" style="--cat-color: ${cat.color}">${cat.name}</th>`;
            }
        });
        headerHtml += '</tr>';

        // Page names row
        headerHtml += '<tr class="page-names-row"><th class="sticky-col"></th><th></th>';
        categories.forEach(cat => {
            const catPages = pages.filter(p => p.category === cat.id);
            catPages.forEach(page => {
                headerHtml += `<th class="page-header" title="${page.description}" style="--cat-color: ${cat.color}">
                    <div class="page-header-content">
                        <i data-lucide="${page.icon}"></i>
                        <span>${page.shortName || page.name.split(' ')[0]}</span>
                    </div>
                </th>`;
            });
        });
        headerHtml += '</tr>';

        // User rows
        let bodyHtml = '';
        filteredUsers.forEach(user => {
            const roleBadge = this.getRoleBadge(user); // Pass full user object

            bodyHtml += `<tr>
                <td class="sticky-col user-col">
                    <div class="user-cell">
                        <span class="user-name">${user.displayName}</span>
                        <span class="user-id">${user.id}</span>
                    </div>
                </td>
                <td class="role-col">${roleBadge}</td>`;

            categories.forEach(cat => {
                const catPages = pages.filter(p => p.category === cat.id);
                catPages.forEach(page => {
                    // Derive page access from detailedPermissions (simplified system)
                    const pagePerms = user.detailedPermissions?.[page.id] || {};
                    const hasAccess = Object.values(pagePerms).some(v => v === true);
                    const cellClass = hasAccess ? 'perm-granted' : 'perm-denied';
                    const icon = hasAccess ? 'check' : 'x';

                    bodyHtml += `<td class="perm-cell ${cellClass}" data-user="${user.id}" data-page="${page.id}"
                                    onclick="permissionsOverview.showPagePermissions('${user.id}', '${page.id}')">
                        <i data-lucide="${icon}"></i>
                    </td>`;
                });
            });

            bodyHtml += '</tr>';
        });

        return `
            <div class="matrix-wrapper">
                <table class="permissions-matrix">
                    <thead>${headerHtml}</thead>
                    <tbody>${bodyHtml}</tbody>
                </table>
            </div>
            <div class="matrix-legend">
                <span class="legend-item granted"><i data-lucide="check"></i> Có quyền truy cập</span>
                <span class="legend-item denied"><i data-lucide="x"></i> Không có quyền</span>
                <span class="legend-tip"><i data-lucide="info"></i> Click vào ô để xem chi tiết quyền của trang</span>
            </div>
        `;
    }

    renderDetailedStats() {
        const pages = this.getPages();
        const categories = this.getCategories();
        const filteredUsers = this.getFilteredUsers();

        if (filteredUsers.length === 0) {
            return `
                <div class="empty-state">
                    <i data-lucide="shield-check"></i>
                    <h3>Không có dữ liệu</h3>
                </div>
            `;
        }

        let html = '';

        categories.forEach(cat => {
            const catPages = pages.filter(p => p.category === cat.id);
            if (catPages.length === 0) return;

            html += `
                <div class="category-stats-section" style="--cat-color: ${cat.color}">
                    <div class="category-stats-header">
                        <i data-lucide="${cat.icon}"></i>
                        <span>${cat.name}</span>
                    </div>
                    <div class="category-stats-content">
            `;

            catPages.forEach(page => {
                const pagePerms = typeof DETAILED_PERMISSIONS !== 'undefined' ? DETAILED_PERMISSIONS[page.id] : null;
                if (!pagePerms || !pagePerms.subPermissions) return;

                html += `
                    <div class="page-stats-card">
                        <div class="page-stats-header">
                            <i data-lucide="${page.icon}"></i>
                            <span>${page.name}</span>
                        </div>
                        <div class="page-stats-perms">
                `;

                Object.entries(pagePerms.subPermissions).forEach(([subKey, subPerm]) => {
                    // Count users with this permission
                    let count = 0;
                    filteredUsers.forEach(user => {
                        if (user.detailedPermissions?.[page.id]?.[subKey]) {
                            count++;
                        }
                    });

                    const percentage = filteredUsers.length > 0 ? Math.round((count / filteredUsers.length) * 100) : 0;

                    html += `
                        <div class="perm-stat-row">
                            <div class="perm-stat-info">
                                <i data-lucide="${subPerm.icon}"></i>
                                <span>${subPerm.name}</span>
                            </div>
                            <div class="perm-stat-bar">
                                <div class="perm-bar-fill" style="width: ${percentage}%"></div>
                            </div>
                            <div class="perm-stat-value">${count}/${filteredUsers.length}</div>
                        </div>
                    `;
                });

                html += '</div></div>';
            });

            html += '</div></div>';
        });

        return html;
    }

    renderRoleStats() {
        const roleStats = {};
        const roleColors = {
            'Admin': '#ef4444',
            'User': '#3b82f6',
            'Limited': '#f59e0b',
            'Basic': '#6b7280',
            'Guest': '#9ca3af'
        };

        this.users.forEach(user => {
            // Use roleTemplate for grouping
            const roleInfo = this.getRoleTemplateInfo(user.roleTemplate);
            const role = roleInfo.name;

            if (!roleStats[role]) {
                roleStats[role] = {
                    count: 0,
                    totalPages: 0,
                    totalDetailedPerms: 0,
                    users: [],
                    color: roleInfo.color,
                    icon: roleInfo.icon
                };
            }

            roleStats[role].count++;

            // Derive page access from detailedPermissions (simplified system)
            if (user.detailedPermissions) {
                Object.entries(user.detailedPermissions).forEach(([pageId, pagePerms]) => {
                    const grantedCount = Object.values(pagePerms).filter(v => v === true).length;
                    roleStats[role].totalDetailedPerms += grantedCount;
                    // User has access to page if at least one permission is true
                    if (grantedCount > 0) roleStats[role].totalPages++;
                });
            }

            roleStats[role].users.push(user.displayName);
        });

        const pages = this.getPages();
        const totalPerms = this.getTotalPermissionsCount();

        let html = '<div class="role-stats-grid">';

        Object.entries(roleStats).forEach(([role, stats]) => {
            const avgPages = Math.round(stats.totalPages / stats.count);
            const avgPerms = Math.round(stats.totalDetailedPerms / stats.count);
            const color = roleColors[role] || '#6b7280';

            html += `
                <div class="role-stat-card" style="--role-color: ${color}">
                    <div class="role-stat-header">
                        <span class="role-name">${role}</span>
                        <span class="role-count">${stats.count} users</span>
                    </div>
                    <div class="role-stat-metrics">
                        <div class="metric">
                            <div class="metric-label">TB Trang truy cập</div>
                            <div class="metric-value">${avgPages}/${pages.length}</div>
                            <div class="metric-bar">
                                <div class="metric-fill" style="width: ${(avgPages/pages.length)*100}%"></div>
                            </div>
                        </div>
                        <div class="metric">
                            <div class="metric-label">TB Quyền chi tiết</div>
                            <div class="metric-value">${avgPerms}/${totalPerms}</div>
                            <div class="metric-bar">
                                <div class="metric-fill" style="width: ${(avgPerms/totalPerms)*100}%"></div>
                            </div>
                        </div>
                    </div>
                    <div class="role-stat-users">
                        <strong>Users:</strong> ${stats.users.slice(0, 5).join(', ')}${stats.users.length > 5 ? ` và ${stats.users.length - 5} khác` : ''}
                    </div>
                </div>
            `;
        });

        html += '</div>';
        return html;
    }

    getFilteredUsers() {
        let filtered = [...this.users];

        // Filter by role
        const roleFilter = document.getElementById('roleFilter')?.value || 'all';
        if (roleFilter !== 'all') {
            filtered = filtered.filter(u => String(u.checkLogin) === roleFilter);
        }

        // Filter by page access (derived from detailedPermissions)
        const pageFilter = document.getElementById('pageFilter')?.value || 'all';
        if (pageFilter !== 'all') {
            filtered = filtered.filter(u => {
                const pagePerms = u.detailedPermissions?.[pageFilter] || {};
                return Object.values(pagePerms).some(v => v === true);
            });
        }

        // Filter by search
        const search = (document.getElementById('userSearchFilter')?.value || '').toLowerCase();
        if (search) {
            filtered = filtered.filter(u =>
                u.displayName?.toLowerCase().includes(search) ||
                u.id?.toLowerCase().includes(search)
            );
        }

        return filtered;
    }

    setView(view) {
        this.currentView = view;

        // Update tabs
        document.querySelectorAll('.overview-tabs .tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.textContent.toLowerCase().includes(
                view === 'matrix' ? 'ma trận' : view === 'detailed' ? 'chi tiết' : 'thống kê'
            ));
        });

        // Re-render content
        const content = document.getElementById('overviewContent');
        if (content) {
            content.innerHTML = this.renderContent();
            if (typeof lucide !== "undefined") {
                lucide.createIcons();
            }
        }
    }

    applyFilters() {
        const content = document.getElementById('overviewContent');
        if (content) {
            content.innerHTML = this.renderContent();
            if (typeof lucide !== "undefined") {
                lucide.createIcons();
            }
        }
    }

    /**
     * Show detailed permissions for a user on a specific page
     * (Replaces old togglePagePermission - simplified system is read-only in overview)
     */
    showPagePermissions(userId, pageId) {
        const user = this.users.find(u => u.id === userId);
        if (!user) return;

        const page = this.getPages().find(p => p.id === pageId);
        if (!page) return;

        const pagePerms = user.detailedPermissions?.[pageId] || {};
        const pageConfig = typeof DETAILED_PERMISSIONS !== 'undefined' ? DETAILED_PERMISSIONS[pageId] : null;

        let report = `QUYỀN CHI TIẾT - ${page.name}\n`;
        report += `${'='.repeat(40)}\n\n`;
        report += `Tài khoản: ${user.displayName} (${user.id})\n\n`;

        if (pageConfig && pageConfig.subPermissions) {
            let grantedCount = 0;
            const totalCount = Object.keys(pageConfig.subPermissions).length;

            Object.entries(pageConfig.subPermissions).forEach(([subKey, subPerm]) => {
                const hasPermission = pagePerms[subKey] === true;
                const icon = hasPermission ? '✓' : '✗';
                report += `${icon} ${subPerm.name}\n`;
                if (hasPermission) grantedCount++;
            });

            report += `\n${'─'.repeat(40)}\n`;
            report += `Tổng: ${grantedCount}/${totalCount} quyền\n`;

            if (grantedCount === 0) {
                report += '\n⚠️ Không có quyền truy cập trang này';
            } else if (grantedCount === totalCount) {
                report += '\n✅ Có đầy đủ quyền trên trang này';
            }
        } else {
            report += '⚠️ Không tìm thấy cấu hình quyền cho trang này';
        }

        report += `\n\n💡 Để chỉnh sửa quyền, nhấn nút "Edit" trên user card.`;

        alert(report);
    }

    exportData() {
        const pages = this.getPages();
        const filteredUsers = this.getFilteredUsers();

        // Create CSV
        let csv = 'Username,Display Name,Role,';
        csv += pages.map(p => p.name).join(',') + '\n';

        filteredUsers.forEach(user => {
            // Use roleTemplate for export
            const roleInfo = this.getRoleTemplateInfo(user.roleTemplate);
            csv += `"${user.id}","${user.displayName}","${roleInfo.name}",`;
            // Derive page access from detailedPermissions
            csv += pages.map(p => {
                const pagePerms = user.detailedPermissions?.[p.id] || {};
                const hasAccess = Object.values(pagePerms).some(v => v === true);
                return hasAccess ? '✓' : '✗';
            }).join(',');
            csv += '\n';
        });

        // Download
        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `permissions-report-${new Date().toISOString().split('T')[0]}.csv`;
        link.click();

        if (typeof window.notify !== 'undefined') {
            window.notify.success('Đã xuất báo cáo thành công!');
        }
    }

    getTotalPermissionsCount() {
        if (typeof PermissionsRegistry !== 'undefined' && PermissionsRegistry.getTotalPermissionsCount) {
            return PermissionsRegistry.getTotalPermissionsCount();
        }
        return 0;
    }

    // Legacy method - kept for backward compatibility
    getRoleName(checkLogin) {
        const names = { 0: 'Admin', 1: 'User', 2: 'Limited', 3: 'Basic', 777: 'Guest' };
        return names[checkLogin] || 'Unknown';
    }

    // NEW: Get role info from roleTemplate
    getRoleTemplateInfo(roleTemplate) {
        const templates = {
            'admin': { name: 'Admin', icon: 'crown', color: '#ef4444' },
            'manager': { name: 'Manager', icon: 'briefcase', color: '#f59e0b' },
            'sales-team': { name: 'Sales Team', icon: 'shopping-cart', color: '#3b82f6' },
            'warehouse-team': { name: 'Warehouse', icon: 'package', color: '#10b981' },
            'staff': { name: 'Staff', icon: 'users', color: '#8b5cf6' },
            'viewer': { name: 'Viewer', icon: 'eye', color: '#6b7280' },
            'custom': { name: 'Custom', icon: 'sliders', color: '#6366f1' }
        };
        return templates[roleTemplate] || templates['custom'];
    }

    // NEW: Get role badge from roleTemplate (user object)
    getRoleBadge(user) {
        // Use roleTemplate if available, fallback to checkLogin
        if (user.roleTemplate) {
            const info = this.getRoleTemplateInfo(user.roleTemplate);
            return `<span class="role-badge" style="background: ${info.color}15; color: ${info.color}; border: 1px solid ${info.color}30;">
                <i data-lucide="${info.icon}"></i>${info.name}
            </span>`;
        }

        // Legacy fallback using checkLogin
        const roles = {
            0: { name: 'Admin', class: 'role-admin', icon: 'crown' },
            1: { name: 'User', class: 'role-user', icon: 'user' },
            2: { name: 'Limited', class: 'role-limited', icon: 'lock' },
            3: { name: 'Basic', class: 'role-basic', icon: 'circle' },
            777: { name: 'Guest', class: 'role-guest', icon: 'user-x' }
        };
        const role = roles[user.checkLogin] || { name: 'Unknown', class: 'role-unknown', icon: 'help-circle' };
        return `<span class="role-badge ${role.class}"><i data-lucide="${role.icon}"></i>${role.name}</span>`;
    }
}

// Global instance
let permissionsOverview = null;

// Override loadPermissionsOverview function
async function loadPermissionsOverview() {
    if (!db) {
        showError("Firebase chưa được kết nối!");
        return;
    }

    const overview = document.getElementById("permissionsOverview");
    overview.innerHTML =
        '<div class="empty-state show"><i data-lucide="loader" class="spinning"></i><h3>Đang tải dữ liệu...</h3></div>';

    if (typeof lucide !== "undefined") {
        lucide.createIcons();
    }

    try {
        // Load users if not already loaded
        if (!users || users.length === 0) {
            const snapshot = await db.collection("users").get();
            users = [];
            snapshot.forEach((doc) => {
                users.push({ id: doc.id, ...doc.data() });
            });
        }

        // Initialize and render overview
        permissionsOverview = new PermissionsOverview("permissionsOverview");
        await permissionsOverview.load(users);

    } catch (error) {
        overview.innerHTML = `<div class="empty-state show"><i data-lucide="alert-circle"></i><h3>Lỗi tải thống kê</h3><p>${error.message}</p></div>`;
        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }
    }
}

// Global export function (called from button in index.html)
function exportPermissions() {
    if (permissionsOverview) {
        permissionsOverview.exportData();
    } else {
        // If overview not loaded, load first then export
        loadPermissionsOverview().then(() => {
            if (permissionsOverview) {
                permissionsOverview.exportData();
            }
        });
    }
}

// =====================================================
// CSS STYLES
// =====================================================
const permissionsOverviewStyle = document.createElement("style");
permissionsOverviewStyle.textContent = `
.permissions-overview-container {
    display: flex;
    flex-direction: column;
    gap: 20px;
}

/* Stats Header */
.overview-stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 16px;
}

.stat-card {
    background: white;
    border-radius: 12px;
    padding: 20px;
    display: flex;
    align-items: center;
    gap: 16px;
    border: 1px solid var(--border-color, #e5e7eb);
    transition: all 0.2s;
}

.stat-card:hover {
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
}

.stat-icon {
    width: 48px;
    height: 48px;
    background: linear-gradient(135deg, #6366f1, #8b5cf6);
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
}

.stat-icon i {
    width: 24px;
    height: 24px;
    color: white;
}

.stat-value {
    font-size: 24px;
    font-weight: 700;
    color: var(--text-primary, #111827);
}

.stat-label {
    font-size: 13px;
    color: var(--text-tertiary, #6b7280);
}

/* Tabs */
.overview-tabs {
    display: flex;
    gap: 8px;
    background: white;
    padding: 6px;
    border-radius: 10px;
    border: 1px solid var(--border-color, #e5e7eb);
    width: fit-content;
}

.overview-tabs .tab-btn {
    padding: 10px 20px;
    background: transparent;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--text-secondary, #374151);
    transition: all 0.2s;
}

.overview-tabs .tab-btn:hover {
    background: var(--bg-secondary, #f3f4f6);
}

.overview-tabs .tab-btn.active {
    background: var(--accent-color, #6366f1);
    color: white;
}

.overview-tabs .tab-btn i {
    width: 16px;
    height: 16px;
}

/* Filters */
.overview-filters {
    display: flex;
    gap: 16px;
    align-items: center;
    flex-wrap: wrap;
    background: white;
    padding: 16px;
    border-radius: 12px;
    border: 1px solid var(--border-color, #e5e7eb);
}

.filter-group {
    display: flex;
    align-items: center;
    gap: 10px;
}

.filter-group label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: var(--text-secondary, #374151);
    font-weight: 500;
}

.filter-group label i {
    width: 14px;
    height: 14px;
}

.filter-group select {
    padding: 8px 12px;
    border: 1px solid var(--border-color, #e5e7eb);
    border-radius: 8px;
    font-size: 13px;
    background: white;
    cursor: pointer;
}

.search-input {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: var(--bg-secondary, #f9fafb);
    border: 1px solid var(--border-color, #e5e7eb);
    border-radius: 8px;
}

.search-input i {
    width: 16px;
    height: 16px;
    color: var(--text-tertiary, #6b7280);
}

.search-input input {
    border: none;
    background: transparent;
    font-size: 13px;
    outline: none;
    width: 150px;
}

.filter-actions {
    margin-left: auto;
}

/* Matrix */
.matrix-wrapper {
    overflow-x: auto;
    background: white;
    border-radius: 12px;
    border: 1px solid var(--border-color, #e5e7eb);
}

.permissions-matrix {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
}

.permissions-matrix th,
.permissions-matrix td {
    padding: 10px 8px;
    text-align: center;
    border-bottom: 1px solid var(--border-color, #e5e7eb);
}

.permissions-matrix thead {
    background: var(--bg-secondary, #f9fafb);
}

.category-header {
    background: linear-gradient(135deg, color-mix(in srgb, var(--cat-color) 15%, white), var(--bg-secondary));
    color: var(--cat-color);
    font-weight: 600;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.page-names-row th {
    font-size: 11px;
    font-weight: 500;
    color: var(--text-secondary, #374151);
}

.page-header-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
}

.page-header-content i {
    width: 14px;
    height: 14px;
    color: var(--cat-color);
}

.sticky-col {
    position: sticky;
    left: 0;
    background: white;
    z-index: 10;
}

.user-col {
    min-width: 180px;
    text-align: left !important;
}

.user-cell {
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.user-name {
    font-weight: 600;
    color: var(--text-primary, #111827);
}

.user-id {
    font-size: 11px;
    color: var(--text-tertiary, #6b7280);
}

.role-col {
    min-width: 100px;
}

.role-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    border-radius: 20px;
    font-size: 11px;
    font-weight: 600;
}

.role-badge i {
    width: 12px;
    height: 12px;
}

.role-admin { background: #fef2f2; color: #dc2626; }
.role-user { background: #eff6ff; color: #2563eb; }
.role-limited { background: #fffbeb; color: #d97706; }
.role-basic { background: #f3f4f6; color: #6b7280; }
.role-guest { background: #f9fafb; color: #9ca3af; }

.perm-cell {
    cursor: pointer;
    transition: all 0.15s;
    width: 40px;
}

.perm-cell:hover {
    background: var(--bg-secondary, #f3f4f6);
}

.perm-cell i {
    width: 16px;
    height: 16px;
}

.perm-granted {
    background: #f0fdf4;
}

.perm-granted i {
    color: #16a34a;
}

.perm-denied {
    background: #fef2f2;
}

.perm-denied i {
    color: #dc2626;
}

.matrix-legend {
    display: flex;
    gap: 20px;
    padding: 12px 16px;
    background: var(--bg-secondary, #f9fafb);
    border-radius: 8px;
    font-size: 12px;
}

.legend-item {
    display: flex;
    align-items: center;
    gap: 6px;
}

.legend-item i {
    width: 14px;
    height: 14px;
}

.legend-item.granted i { color: #16a34a; }
.legend-item.denied i { color: #dc2626; }

.legend-tip {
    margin-left: auto;
    color: var(--text-tertiary, #6b7280);
    display: flex;
    align-items: center;
    gap: 6px;
}

.legend-tip i {
    width: 14px;
    height: 14px;
}

/* Detailed Stats */
.category-stats-section {
    background: white;
    border-radius: 12px;
    border: 1px solid var(--border-color, #e5e7eb);
    margin-bottom: 20px;
    overflow: hidden;
}

.category-stats-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 16px 20px;
    background: linear-gradient(135deg, color-mix(in srgb, var(--cat-color) 10%, white), white);
    border-bottom: 1px solid var(--border-color, #e5e7eb);
    font-weight: 600;
    color: var(--text-primary, #111827);
}

.category-stats-header i {
    width: 20px;
    height: 20px;
    color: var(--cat-color);
}

.category-stats-content {
    padding: 20px;
    display: grid;
    gap: 16px;
}

.page-stats-card {
    background: var(--bg-secondary, #f9fafb);
    border-radius: 10px;
    padding: 16px;
}

.page-stats-header {
    display: flex;
    align-items: center;
    gap: 10px;
    font-weight: 600;
    margin-bottom: 12px;
}

.page-stats-header i {
    width: 18px;
    height: 18px;
    color: var(--cat-color);
}

.page-stats-perms {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.perm-stat-row {
    display: flex;
    align-items: center;
    gap: 12px;
}

.perm-stat-info {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 150px;
    font-size: 13px;
}

.perm-stat-info i {
    width: 14px;
    height: 14px;
    color: var(--cat-color);
}

.perm-stat-bar {
    flex: 1;
    height: 8px;
    background: var(--border-color, #e5e7eb);
    border-radius: 4px;
    overflow: hidden;
}

.perm-bar-fill {
    height: 100%;
    background: var(--cat-color, #6366f1);
    border-radius: 4px;
    transition: width 0.3s ease;
}

.perm-stat-value {
    font-size: 12px;
    font-weight: 500;
    color: var(--text-secondary, #374151);
    width: 60px;
    text-align: right;
}

/* Role Stats */
.role-stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 20px;
}

.role-stat-card {
    background: white;
    border-radius: 12px;
    border: 2px solid var(--role-color);
    overflow: hidden;
}

.role-stat-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 20px;
    background: linear-gradient(135deg, color-mix(in srgb, var(--role-color) 10%, white), white);
    border-bottom: 1px solid var(--border-color, #e5e7eb);
}

.role-name {
    font-weight: 700;
    font-size: 16px;
    color: var(--role-color);
}

.role-count {
    font-size: 13px;
    color: var(--text-tertiary, #6b7280);
}

.role-stat-metrics {
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.metric-label {
    font-size: 12px;
    color: var(--text-tertiary, #6b7280);
    margin-bottom: 4px;
}

.metric-value {
    font-size: 18px;
    font-weight: 600;
    color: var(--text-primary, #111827);
    margin-bottom: 6px;
}

.metric-bar {
    height: 6px;
    background: var(--bg-tertiary, #e5e7eb);
    border-radius: 3px;
    overflow: hidden;
}

.metric-fill {
    height: 100%;
    background: var(--role-color);
    border-radius: 3px;
}

.role-stat-users {
    padding: 12px 20px;
    background: var(--bg-secondary, #f9fafb);
    font-size: 12px;
    color: var(--text-secondary, #374151);
    border-top: 1px solid var(--border-color, #e5e7eb);
}

/* Empty State */
.overview-content .empty-state {
    padding: 60px 20px;
    text-align: center;
    background: white;
    border-radius: 12px;
    border: 1px solid var(--border-color, #e5e7eb);
}

.empty-state i {
    width: 48px;
    height: 48px;
    color: var(--text-tertiary, #6b7280);
    margin-bottom: 16px;
}

.empty-state h3 {
    margin: 0 0 8px;
    color: var(--text-primary, #111827);
}

.empty-state p {
    margin: 0;
    color: var(--text-tertiary, #6b7280);
}

@media (max-width: 768px) {
    .overview-filters {
        flex-direction: column;
        align-items: stretch;
    }

    .filter-group {
        flex-wrap: wrap;
    }

    .filter-actions {
        margin-left: 0;
    }

    .overview-tabs {
        width: 100%;
        overflow-x: auto;
    }
}
`;
document.head.appendChild(permissionsOverviewStyle);

console.log("[Permissions Overview] Loaded - Enhanced permissions matrix");
