// =====================================================
// PAGE PERMISSIONS UI MANAGER
// Quản lý quyền truy cập trang (pagePermissions)
// Sử dụng permissions-registry.js làm Single Source of Truth
// =====================================================

/**
 * PagePermissionsUI - UI Component để chọn page permissions
 *
 * Dependencies: permissions-registry.js (phải load trước)
 */
class PagePermissionsUI {
    constructor(containerId, formPrefix = "") {
        this.containerId = containerId;
        this.formPrefix = formPrefix;
        this.selectedPermissions = [];
        this.groupByCategory = true; // Mặc định group theo category
        this.render();
    }

    /**
     * Lấy danh sách pages từ registry
     */
    getPages() {
        if (typeof PAGES_REGISTRY !== 'undefined') {
            return Object.values(PAGES_REGISTRY);
        }
        console.error('[PagePermissionsUI] PAGES_REGISTRY not found! Make sure permissions-registry.js is loaded first.');
        return [];
    }

    /**
     * Lấy categories từ registry
     */
    getCategories() {
        if (typeof PAGE_CATEGORIES !== 'undefined') {
            return Object.values(PAGE_CATEGORIES).sort((a, b) => a.order - b.order);
        }
        return [];
    }

    /**
     * Lấy pages theo category
     */
    getPagesByCategory(categoryId) {
        return this.getPages().filter(page => page.category === categoryId);
    }

    render() {
        const container = document.getElementById(this.containerId);
        if (!container) {
            console.error(`[PagePermissionsUI] Container #${this.containerId} not found!`);
            return;
        }

        const pages = this.getPages();
        if (pages.length === 0) {
            container.innerHTML = `
                <div class="page-permissions-section">
                    <div class="empty-state">
                        <i data-lucide="alert-circle"></i>
                        <p>Không thể load danh sách trang. Vui lòng refresh.</p>
                    </div>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <div class="page-permissions-section">
                <div class="section-header">
                    <h3>
                        <i data-lucide="layout-grid" style="width:20px;height:20px;display:inline-block;vertical-align:middle;margin-right:8px;"></i>
                        Quyền Truy Cập Trang
                        <span class="page-count-badge">${pages.length} trang</span>
                    </h3>
                    <div class="quick-actions">
                        <button type="button" class="btn-quick-select" onclick="window.${this.formPrefix}PagePermUI.selectAll()">
                            <i data-lucide="check-square"></i>
                            Chọn tất cả
                        </button>
                        <button type="button" class="btn-quick-select" onclick="window.${this.formPrefix}PagePermUI.selectNone()">
                            <i data-lucide="square"></i>
                            Bỏ chọn
                        </button>
                        <div class="template-dropdown">
                            <button type="button" class="btn-quick-select dropdown-toggle" onclick="window.${this.formPrefix}PagePermUI.toggleTemplateMenu()">
                                <i data-lucide="layout-template"></i>
                                Templates
                                <i data-lucide="chevron-down" style="width:12px;height:12px;"></i>
                            </button>
                            <div class="template-menu" id="${this.formPrefix}templateMenu">
                                ${this.renderTemplateOptions()}
                            </div>
                        </div>
                    </div>
                </div>

                <div class="view-toggle">
                    <button type="button" class="view-btn ${this.groupByCategory ? 'active' : ''}"
                            onclick="window.${this.formPrefix}PagePermUI.setGroupByCategory(true)">
                        <i data-lucide="layout-grid"></i> Theo nhóm
                    </button>
                    <button type="button" class="view-btn ${!this.groupByCategory ? 'active' : ''}"
                            onclick="window.${this.formPrefix}PagePermUI.setGroupByCategory(false)">
                        <i data-lucide="list"></i> Danh sách
                    </button>
                </div>

                <div class="permissions-content" id="${this.formPrefix}permissionsContent">
                    ${this.groupByCategory ? this.renderGroupedByCategory() : this.renderFlatList()}
                </div>

                <div class="permissions-summary" id="${this.formPrefix}pagePermissionsSummary">
                    <i data-lucide="info"></i>
                    <span>Chọn các trang mà user này có thể truy cập</span>
                </div>
            </div>
        `;

        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }

        this.updateSummary();
    }

    renderTemplateOptions() {
        const templates = typeof PERMISSION_TEMPLATES !== 'undefined' ? PERMISSION_TEMPLATES : {};

        return Object.entries(templates).map(([id, template]) => `
            <button type="button" class="template-option" onclick="window.${this.formPrefix}PagePermUI.selectTemplate('${id}')">
                <i data-lucide="${template.icon}"></i>
                <span>${template.name}</span>
            </button>
        `).join('');
    }

    renderGroupedByCategory() {
        const categories = this.getCategories();

        return categories.map(category => {
            const pages = this.getPagesByCategory(category.id);
            if (pages.length === 0) return '';

            return `
                <div class="category-group" data-category="${category.id}">
                    <div class="category-header" style="--category-color: ${category.color}">
                        <div class="category-title">
                            <i data-lucide="${category.icon}"></i>
                            <span>${category.name}</span>
                            <span class="category-count">${pages.length}</span>
                        </div>
                        <button type="button" class="btn-category-toggle"
                                onclick="window.${this.formPrefix}PagePermUI.toggleCategory('${category.id}')">
                            <i data-lucide="check-square"></i>
                        </button>
                    </div>
                    <div class="category-pages">
                        ${pages.map(page => this.renderPageCard(page)).join('')}
                    </div>
                </div>
            `;
        }).join('');
    }

    renderFlatList() {
        const pages = this.getPages();
        return `
            <div class="permissions-grid">
                ${pages.map(page => this.renderPageCard(page)).join('')}
            </div>
        `;
    }

    renderPageCard(page) {
        const cardClass = page.adminOnly ? "page-card admin-only" : "page-card";
        const adminBadge = page.adminOnly
            ? '<span class="admin-badge"><i data-lucide="crown"></i>Admin</span>'
            : "";
        const categoryColor = this.getCategoryColor(page.category);

        return `
            <div class="${cardClass}" data-page-id="${page.id}" style="--category-color: ${categoryColor}">
                <div class="page-card-header">
                    <input
                        type="checkbox"
                        id="${this.formPrefix}page_${page.id}"
                        value="${page.id}"
                        onchange="window.${this.formPrefix}PagePermUI.updateSummary()"
                    />
                    <label for="${this.formPrefix}page_${page.id}">
                        <div class="page-icon">
                            <i data-lucide="${page.icon}"></i>
                        </div>
                        <div class="page-info">
                            <div class="page-name">${page.name}${adminBadge}</div>
                            <div class="page-description">${page.description}</div>
                        </div>
                    </label>
                </div>
            </div>
        `;
    }

    getCategoryColor(categoryId) {
        const categories = typeof PAGE_CATEGORIES !== 'undefined' ? PAGE_CATEGORIES : {};
        return categories[categoryId]?.color || '#6366f1';
    }

    toggleTemplateMenu() {
        const menu = document.getElementById(`${this.formPrefix}templateMenu`);
        if (menu) {
            menu.classList.toggle('show');
        }
    }

    setGroupByCategory(grouped) {
        this.groupByCategory = grouped;
        const content = document.getElementById(`${this.formPrefix}permissionsContent`);
        if (content) {
            content.innerHTML = grouped ? this.renderGroupedByCategory() : this.renderFlatList();

            // Re-apply current selections
            this.selectedPermissions.forEach(pageId => {
                const checkbox = document.getElementById(`${this.formPrefix}page_${pageId}`);
                if (checkbox) checkbox.checked = true;
            });

            // Update view toggle buttons
            const buttons = document.querySelectorAll(`#${this.containerId} .view-btn`);
            buttons.forEach((btn, i) => {
                btn.classList.toggle('active', (i === 0) === grouped);
            });

            if (typeof lucide !== "undefined") {
                lucide.createIcons();
            }
        }
    }

    toggleCategory(categoryId) {
        const pages = this.getPagesByCategory(categoryId);
        const checkboxes = pages.map(p => document.getElementById(`${this.formPrefix}page_${p.id}`)).filter(Boolean);

        const allChecked = checkboxes.every(cb => cb.checked);
        checkboxes.forEach(cb => cb.checked = !allChecked);

        this.updateSummary();
    }

    setPermissions(pagePermissions) {
        this.selectedPermissions = pagePermissions || [];
        const pages = this.getPages();

        // Uncheck all first
        pages.forEach((page) => {
            const checkbox = document.getElementById(`${this.formPrefix}page_${page.id}`);
            if (checkbox) {
                checkbox.checked = false;
            }
        });

        // Check selected permissions
        this.selectedPermissions.forEach((pageId) => {
            const checkbox = document.getElementById(`${this.formPrefix}page_${pageId}`);
            if (checkbox) {
                checkbox.checked = true;
            }
        });

        this.updateSummary();
    }

    getPermissions() {
        const permissions = [];
        const pages = this.getPages();

        pages.forEach((page) => {
            const checkbox = document.getElementById(`${this.formPrefix}page_${page.id}`);
            if (checkbox && checkbox.checked) {
                permissions.push(page.id);
            }
        });

        // Update internal state
        this.selectedPermissions = permissions;
        return permissions;
    }

    selectAll() {
        const pages = this.getPages();
        pages.forEach((page) => {
            const checkbox = document.getElementById(`${this.formPrefix}page_${page.id}`);
            if (checkbox) {
                checkbox.checked = true;
            }
        });
        this.updateSummary();
    }

    selectNone() {
        const pages = this.getPages();
        pages.forEach((page) => {
            const checkbox = document.getElementById(`${this.formPrefix}page_${page.id}`);
            if (checkbox) {
                checkbox.checked = false;
            }
        });
        this.updateSummary();
    }

    selectTemplate(templateId) {
        // Close dropdown
        const menu = document.getElementById(`${this.formPrefix}templateMenu`);
        if (menu) menu.classList.remove('show');

        // Use registry to generate template permissions
        if (typeof PermissionsRegistry !== 'undefined' && PermissionsRegistry.generateTemplatePermissions) {
            const templateData = PermissionsRegistry.generateTemplatePermissions(templateId);
            const selectedPages = templateData.pagePermissions || [];

            // Uncheck all first
            this.selectNone();

            // Check template pages
            selectedPages.forEach((pageId) => {
                const checkbox = document.getElementById(`${this.formPrefix}page_${pageId}`);
                if (checkbox) {
                    checkbox.checked = true;
                }
            });

            this.updateSummary();

            // Show notification
            if (typeof window.notify !== 'undefined') {
                const template = PERMISSION_TEMPLATES[templateId];
                window.notify.success(`Đã áp dụng template "${template?.name || templateId}"`);
            }
        } else {
            console.error('[PagePermissionsUI] PermissionsRegistry.generateTemplatePermissions not available');
        }
    }

    updateSummary() {
        const permissions = this.getPermissions();
        const summary = document.getElementById(`${this.formPrefix}pagePermissionsSummary`);
        const pages = this.getPages();

        if (!summary) return;

        if (permissions.length === 0) {
            summary.className = "permissions-summary empty";
            summary.innerHTML = `
                <i data-lucide="alert-triangle"></i>
                <span>Chưa chọn trang nào - User sẽ không truy cập được hệ thống!</span>
            `;
        } else {
            const pageNames = permissions
                .slice(0, 5)
                .map((id) => {
                    const page = pages.find((p) => p.id === id);
                    return page ? page.name : id;
                })
                .join(", ");

            const moreText = permissions.length > 5 ? ` và ${permissions.length - 5} trang khác` : '';

            summary.className = "permissions-summary success";
            summary.innerHTML = `
                <i data-lucide="check-circle"></i>
                <span><strong>${permissions.length}/${pages.length}</strong> trang được phép: ${pageNames}${moreText}</span>
            `;
        }

        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }
    }
}

// =====================================================
// CSS STYLES
// =====================================================
const pagePermissionsStyle = document.createElement("style");
pagePermissionsStyle.textContent = `
.page-permissions-section {
    margin-top: 24px;
    padding: 20px;
    background: var(--bg-secondary, #f9fafb);
    border-radius: 12px;
    border: 1px solid var(--border-color, #e5e7eb);
}

.section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
    flex-wrap: wrap;
    gap: 12px;
}

.section-header h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: var(--text-primary, #111827);
    display: flex;
    align-items: center;
    gap: 8px;
}

.page-count-badge {
    background: var(--accent-color, #6366f1);
    color: white;
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 12px;
    font-weight: 500;
}

.quick-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    align-items: center;
}

.btn-quick-select {
    padding: 6px 12px;
    background: white;
    border: 1px solid var(--border-color, #e5e7eb);
    border-radius: 6px;
    font-size: 13px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
    transition: all 0.2s;
    color: var(--text-secondary, #374151);
    font-weight: 500;
}

.btn-quick-select:hover {
    background: var(--bg-tertiary, #f3f4f6);
    border-color: var(--accent-color, #6366f1);
}

.btn-quick-select i {
    width: 14px;
    height: 14px;
}

/* Template Dropdown */
.template-dropdown {
    position: relative;
}

.template-menu {
    display: none;
    position: absolute;
    top: 100%;
    right: 0;
    margin-top: 4px;
    background: white;
    border: 1px solid var(--border-color, #e5e7eb);
    border-radius: 8px;
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
    z-index: 100;
    min-width: 200px;
    padding: 4px;
}

.template-menu.show {
    display: block;
}

.template-option {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 10px 12px;
    background: none;
    border: none;
    cursor: pointer;
    font-size: 13px;
    color: var(--text-primary, #111827);
    border-radius: 6px;
    transition: background 0.15s;
}

.template-option:hover {
    background: var(--bg-secondary, #f3f4f6);
}

.template-option i {
    width: 16px;
    height: 16px;
    color: var(--accent-color, #6366f1);
}

/* View Toggle */
.view-toggle {
    display: flex;
    gap: 4px;
    margin-bottom: 16px;
    background: white;
    padding: 4px;
    border-radius: 8px;
    border: 1px solid var(--border-color, #e5e7eb);
    width: fit-content;
}

.view-btn {
    padding: 6px 12px;
    background: transparent;
    border: none;
    border-radius: 6px;
    font-size: 13px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--text-tertiary, #6b7280);
    transition: all 0.2s;
}

.view-btn.active {
    background: var(--accent-color, #6366f1);
    color: white;
}

.view-btn i {
    width: 14px;
    height: 14px;
}

/* Category Groups */
.category-group {
    margin-bottom: 20px;
    background: white;
    border-radius: 12px;
    border: 1px solid var(--border-color, #e5e7eb);
    overflow: hidden;
}

.category-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    background: linear-gradient(135deg, color-mix(in srgb, var(--category-color) 10%, white), white);
    border-bottom: 1px solid var(--border-color, #e5e7eb);
}

.category-title {
    display: flex;
    align-items: center;
    gap: 10px;
    font-weight: 600;
    color: var(--text-primary, #111827);
}

.category-title i {
    width: 20px;
    height: 20px;
    color: var(--category-color, #6366f1);
}

.category-count {
    background: var(--category-color, #6366f1);
    color: white;
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 12px;
    font-weight: 500;
}

.btn-category-toggle {
    padding: 6px 10px;
    background: white;
    border: 1px solid var(--border-color, #e5e7eb);
    border-radius: 6px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: var(--text-secondary, #374151);
    transition: all 0.2s;
}

.btn-category-toggle:hover {
    background: var(--bg-tertiary, #f3f4f6);
    border-color: var(--category-color, #6366f1);
}

.btn-category-toggle i {
    width: 14px;
    height: 14px;
}

.category-pages {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 12px;
    padding: 16px;
}

/* Page Cards */
.permissions-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 12px;
    margin-bottom: 20px;
}

.page-card {
    background: white;
    border: 2px solid var(--border-color, #e5e7eb);
    border-radius: 10px;
    transition: all 0.2s;
    overflow: hidden;
}

.page-card:hover {
    border-color: var(--category-color, var(--accent-color, #6366f1));
    box-shadow: 0 4px 6px -1px rgba(99, 102, 241, 0.1);
}

.page-card.admin-only {
    background: linear-gradient(135deg, #fffbeb 0%, #ffffff 100%);
    border-color: #fbbf24;
}

.page-card-header {
    padding: 16px;
    display: flex;
    align-items: flex-start;
    gap: 12px;
}

.page-card-header input[type="checkbox"] {
    width: 20px;
    height: 20px;
    cursor: pointer;
    margin-top: 2px;
    flex-shrink: 0;
    accent-color: var(--category-color, var(--accent-color, #6366f1));
}

.page-card-header label {
    flex: 1;
    cursor: pointer;
    display: flex;
    gap: 12px;
    align-items: flex-start;
}

.page-icon {
    width: 40px;
    height: 40px;
    background: var(--bg-secondary, #f3f4f6);
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
}

.page-card:hover .page-icon {
    background: color-mix(in srgb, var(--category-color, #6366f1) 10%, white);
}

.page-card.admin-only .page-icon {
    background: rgba(251, 191, 36, 0.1);
}

.page-icon i {
    width: 20px;
    height: 20px;
    color: var(--category-color, var(--accent-color, #6366f1));
}

.page-card.admin-only .page-icon i {
    color: #f59e0b;
}

.page-info {
    flex: 1;
}

.page-name {
    font-weight: 600;
    color: var(--text-primary, #111827);
    margin-bottom: 4px;
    font-size: 14px;
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
}

.admin-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: #fef3c7;
    color: #f59e0b;
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 600;
}

.admin-badge i {
    width: 12px;
    height: 12px;
}

.page-description {
    font-size: 12px;
    color: var(--text-tertiary, #6b7280);
    line-height: 1.4;
}

/* Summary */
.permissions-summary {
    padding: 16px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 14px;
    line-height: 1.5;
    margin-top: 16px;
}

.permissions-summary.empty {
    background: #fef2f2;
    border: 1px solid #fecaca;
    color: #dc2626;
}

.permissions-summary.success {
    background: #f0fdf4;
    border: 1px solid #bbf7d0;
    color: #16a34a;
}

.permissions-summary i {
    width: 20px;
    height: 20px;
    flex-shrink: 0;
}

.permissions-summary span {
    flex: 1;
}

@media (max-width: 768px) {
    .permissions-grid,
    .category-pages {
        grid-template-columns: 1fr;
    }

    .section-header {
        flex-direction: column;
        align-items: flex-start;
    }

    .quick-actions {
        width: 100%;
    }

    .btn-quick-select {
        flex: 1;
        justify-content: center;
    }
}
`;
document.head.appendChild(pagePermissionsStyle);

console.log("[Page Permissions UI] Loaded - Using permissions-registry.js");
