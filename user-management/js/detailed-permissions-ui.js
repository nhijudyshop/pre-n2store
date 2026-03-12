// =====================================================
// DETAILED PERMISSIONS UI MANAGER
// Quản lý quyền chi tiết (detailedPermissions)
// Sử dụng permissions-registry.js làm Single Source of Truth
// =====================================================

/**
 * DetailedPermissionsUI - UI Component để chọn detailed permissions
 *
 * Dependencies: permissions-registry.js (phải load trước)
 */
class DetailedPermissionsUI {
    constructor(containerId, prefix = "") {
        this.containerId = containerId;
        this.prefix = prefix;
        this.currentPermissions = {};
        this.currentTemplate = "custom";
        this.groupByCategory = true;
    }

    /**
     * Lấy detailed permissions từ registry
     * Format: { pageId: { id, name, icon, description, subPermissions: {...} } }
     */
    getDetailedPermissions() {
        if (typeof PermissionsRegistry !== 'undefined' && PermissionsRegistry.getAllDetailedPermissions) {
            return PermissionsRegistry.getAllDetailedPermissions();
        }
        // Fallback to legacy DETAILED_PERMISSIONS if exists
        if (typeof DETAILED_PERMISSIONS !== 'undefined') {
            return DETAILED_PERMISSIONS;
        }
        console.error('[DetailedPermissionsUI] No permissions source found!');
        return {};
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
        if (typeof PAGES_REGISTRY !== 'undefined') {
            return Object.values(PAGES_REGISTRY).filter(p => p.category === categoryId);
        }
        return [];
    }

    render(permissions = {}) {
        this.currentPermissions = permissions;
        const container = document.getElementById(this.containerId);
        if (!container) return;

        const detailedPerms = this.getDetailedPermissions();
        const totalPerms = this.getTotalPermissionsCount();

        container.innerHTML = `
            <div class="detailed-permissions-section">
                <div class="section-header">
                    <h3>
                        <i data-lucide="shield-check" style="width:20px;height:20px;display:inline-block;vertical-align:middle;margin-right:8px;"></i>
                        Quyền Truy Cập Chi Tiết
                        <span class="perm-count-badge">${totalPerms} quyền</span>
                    </h3>
                    <p class="section-desc">
                        Phân quyền chi tiết cho từng chức năng của từng trang
                    </p>
                </div>

                <div class="template-section">
                    <div class="template-header">
                        <i data-lucide="layout-template"></i>
                        <span>Áp dụng Template:</span>
                    </div>
                    <div class="template-buttons">
                        ${this.renderTemplateButtons()}
                    </div>
                </div>

                <div class="permissions-summary-bar" id="${this.prefix}permissionsSummary">
                    <div class="summary-progress">
                        <div class="progress-bar" id="${this.prefix}progressBar" style="width: 0%"></div>
                    </div>
                    <span class="permissions-count">0/${totalPerms} quyền được chọn</span>
                </div>

                <div class="view-toggle">
                    <button type="button" class="view-btn ${this.groupByCategory ? 'active' : ''}"
                            onclick="window.${this.prefix}DetailedPermUI.setGroupByCategory(true)">
                        <i data-lucide="layout-grid"></i> Theo nhóm
                    </button>
                    <button type="button" class="view-btn ${!this.groupByCategory ? 'active' : ''}"
                            onclick="window.${this.prefix}DetailedPermUI.setGroupByCategory(false)">
                        <i data-lucide="list"></i> Danh sách
                    </button>
                </div>

                <div class="permissions-grid-detailed" id="${this.prefix}permissionsGrid">
                    ${this.groupByCategory ? this.renderGroupedByCategory() : this.renderFlatList()}
                </div>
            </div>
        `;

        this.updateSummary();

        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }
    }

    renderTemplateButtons() {
        let templates = typeof PERMISSION_TEMPLATES !== 'undefined' ? { ...PERMISSION_TEMPLATES } : {};

        // Remove 'custom' placeholder if exists
        delete templates.custom;

        // Add custom templates from templateManager if available
        if (typeof window.templateManager !== 'undefined' && window.templateManager.customTemplates) {
            Object.entries(window.templateManager.customTemplates).forEach(([id, template]) => {
                templates[id] = {
                    ...template,
                    isCustom: true
                };
            });
        }

        // Separate built-in and custom templates
        const builtInTemplates = Object.entries(templates).filter(([_, t]) => !t.isCustom);
        const customTemplates = Object.entries(templates).filter(([_, t]) => t.isCustom);

        let html = '';

        // Built-in templates
        html += builtInTemplates.map(([id, template]) => `
            <button type="button" class="template-btn"
                    style="--template-color: ${template.color || '#6366f1'}"
                    onclick="window.${this.prefix}DetailedPermUI.applyTemplate('${id}')">
                <i data-lucide="${template.icon}"></i>
                <span>${(template.name || id).split(' - ')[0]}</span>
            </button>
        `).join('');

        // Custom templates (if any)
        if (customTemplates.length > 0) {
            html += `<span class="template-separator">|</span>`;
            html += customTemplates.map(([id, template]) => `
                <button type="button" class="template-btn custom-template"
                        style="--template-color: ${template.color || '#3b82f6'}"
                        onclick="window.${this.prefix}DetailedPermUI.applyTemplate('${id}', true)"
                        title="Template tùy chỉnh">
                    <i data-lucide="${template.icon || 'sliders'}"></i>
                    <span>${(template.name || id).split(' - ')[0]}</span>
                </button>
            `).join('');
        }

        // Clear button
        html += `
            <button type="button" class="template-btn clear-btn" onclick="window.${this.prefix}DetailedPermUI.applyTemplate('clear')">
                <i data-lucide="trash-2"></i>
                <span>Xóa tất cả</span>
            </button>
        `;

        return html;
    }

    renderGroupedByCategory() {
        const categories = this.getCategories();

        return categories.map(category => {
            const pages = this.getPagesByCategory(category.id);
            if (pages.length === 0) return '';

            return `
                <div class="category-section" data-category="${category.id}">
                    <div class="category-header-detailed" style="--category-color: ${category.color}">
                        <div class="category-info">
                            <i data-lucide="${category.icon}"></i>
                            <span>${category.name}</span>
                            <span class="category-badge">${pages.length} trang</span>
                        </div>
                        <button type="button" class="btn-toggle-category"
                                onclick="window.${this.prefix}DetailedPermUI.toggleAllCategory('${category.id}')">
                            <i data-lucide="check-square"></i>
                            Chọn tất cả
                        </button>
                    </div>
                    <div class="category-content">
                        ${pages.map(page => this.renderPageCard(page)).join('')}
                    </div>
                </div>
            `;
        }).join('');
    }

    renderFlatList() {
        const detailedPerms = this.getDetailedPermissions();
        return Object.values(detailedPerms).map(page => {
            const fullPage = typeof PAGES_REGISTRY !== 'undefined' ? PAGES_REGISTRY[page.id] : page;
            return this.renderPageCard(fullPage || page);
        }).join('');
    }

    renderPageCard(page) {
        const detailedPerms = this.getDetailedPermissions();
        const pagePerms = detailedPerms[page.id];
        if (!pagePerms || !pagePerms.subPermissions) return '';

        const subPermissions = pagePerms.subPermissions;
        const checkedCount = this.getCheckedCountForPage(page.id);
        const totalCount = Object.keys(subPermissions).length;
        const hasAccess = checkedCount > 0; // User has access if at least one permission is true
        const categoryColor = this.getCategoryColor(page.category);

        // Access indicator - shows if user can access this page
        const accessIndicator = hasAccess
            ? `<span class="access-badge access-granted"><i data-lucide="check-circle"></i> Có quyền truy cập</span>`
            : `<span class="access-badge access-denied"><i data-lucide="x-circle"></i> Không có quyền</span>`;

        return `
            <div class="permission-card-detailed ${hasAccess ? 'has-permissions' : ''}"
                 data-page-id="${page.id}"
                 style="--category-color: ${categoryColor}">
                <div class="permission-header">
                    <div class="permission-title">
                        <div class="page-icon-wrapper">
                            <i data-lucide="${page.icon}" class="page-icon"></i>
                        </div>
                        <div class="page-details">
                            <h4>${page.name}</h4>
                            <p class="permission-desc">${page.description}</p>
                            ${accessIndicator}
                        </div>
                    </div>
                    <div class="permission-actions">
                        <span class="perm-count">${checkedCount}/${totalCount}</span>
                        <button type="button" class="toggle-all-btn ${hasAccess ? 'active' : ''}"
                                onclick="window.${this.prefix}DetailedPermUI.toggleAllForPage('${page.id}')"
                                title="${hasAccess ? 'Thu hồi quyền truy cập' : 'Cấp full quyền'}">
                            <i data-lucide="${hasAccess ? 'toggle-right' : 'toggle-left'}"></i>
                        </button>
                    </div>
                </div>
                <div class="sub-permissions">
                    ${Object.entries(subPermissions).map(([subKey, subPerm]) => {
                        const isChecked = this.currentPermissions[page.id]?.[subKey] || false;
                        const checkboxId = `${this.prefix}perm_${page.id}_${subKey}`;
                        return `
                            <label class="sub-perm-item ${isChecked ? 'checked' : ''}">
                                <input type="checkbox"
                                       id="${checkboxId}"
                                       data-page="${page.id}"
                                       data-sub="${subKey}"
                                       ${isChecked ? 'checked' : ''}
                                       onchange="window.${this.prefix}DetailedPermUI.togglePermission('${page.id}', '${subKey}')">
                                <i data-lucide="${subPerm.icon}" class="sub-perm-icon"></i>
                                <span class="sub-perm-name">${subPerm.name}</span>
                                ${subPerm.description ? `<span class="sub-perm-desc">${subPerm.description}</span>` : ''}
                            </label>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }

    getCategoryColor(categoryId) {
        const categories = typeof PAGE_CATEGORIES !== 'undefined' ? PAGE_CATEGORIES : {};
        return categories[categoryId]?.color || '#6366f1';
    }

    getCheckedCountForPage(pageId) {
        const pagePerms = this.currentPermissions[pageId] || {};
        return Object.values(pagePerms).filter(v => v === true).length;
    }

    getTotalPermissionsCount() {
        if (typeof PermissionsRegistry !== 'undefined' && PermissionsRegistry.getTotalPermissionsCount) {
            return PermissionsRegistry.getTotalPermissionsCount();
        }
        const detailedPerms = this.getDetailedPermissions();
        let total = 0;
        Object.values(detailedPerms).forEach(page => {
            total += Object.keys(page.subPermissions || {}).length;
        });
        return total;
    }

    setGroupByCategory(grouped) {
        this.groupByCategory = grouped;
        const grid = document.getElementById(`${this.prefix}permissionsGrid`);
        if (grid) {
            grid.innerHTML = grouped ? this.renderGroupedByCategory() : this.renderFlatList();

            // Update view toggle buttons
            const container = document.getElementById(this.containerId);
            if (container) {
                const buttons = container.querySelectorAll('.view-btn');
                buttons.forEach((btn, i) => {
                    btn.classList.toggle('active', (i === 0) === grouped);
                });
            }

            if (typeof lucide !== "undefined") {
                lucide.createIcons();
            }
        }
    }

    togglePermission(pageId, subKey) {
        if (!this.currentPermissions[pageId]) {
            this.currentPermissions[pageId] = {};
        }

        this.currentPermissions[pageId][subKey] = !this.currentPermissions[pageId][subKey];
        this.currentTemplate = "custom";

        // Update UI
        const checkbox = document.getElementById(`${this.prefix}perm_${pageId}_${subKey}`);
        if (checkbox) {
            const label = checkbox.closest('.sub-perm-item');
            if (label) {
                label.classList.toggle('checked', checkbox.checked);
            }
        }

        this.updateCardCount(pageId);
        this.updateSummary();
    }

    toggleAllForPage(pageId) {
        const detailedPerms = this.getDetailedPermissions();
        const pagePerms = detailedPerms[pageId];
        if (!pagePerms) return;

        const checkboxes = document.querySelectorAll(
            `input[data-page="${pageId}"][id^="${this.prefix}perm_"]`
        );
        const allChecked = Array.from(checkboxes).every(cb => cb.checked);

        if (!this.currentPermissions[pageId]) {
            this.currentPermissions[pageId] = {};
        }

        Object.keys(pagePerms.subPermissions).forEach(subKey => {
            this.currentPermissions[pageId][subKey] = !allChecked;
        });

        this.currentTemplate = "custom";

        checkboxes.forEach(cb => {
            cb.checked = !allChecked;
            const label = cb.closest('.sub-perm-item');
            if (label) {
                label.classList.toggle('checked', !allChecked);
            }
        });

        this.updateCardCount(pageId);
        this.updateSummary();
    }

    toggleAllCategory(categoryId) {
        const pages = this.getPagesByCategory(categoryId);
        const detailedPerms = this.getDetailedPermissions();

        // Check if all permissions in category are checked
        let allChecked = true;
        pages.forEach(page => {
            const pagePerms = detailedPerms[page.id];
            if (pagePerms) {
                Object.keys(pagePerms.subPermissions).forEach(subKey => {
                    if (!this.currentPermissions[page.id]?.[subKey]) {
                        allChecked = false;
                    }
                });
            }
        });

        // Toggle all
        pages.forEach(page => {
            const pagePerms = detailedPerms[page.id];
            if (pagePerms) {
                if (!this.currentPermissions[page.id]) {
                    this.currentPermissions[page.id] = {};
                }
                Object.keys(pagePerms.subPermissions).forEach(subKey => {
                    this.currentPermissions[page.id][subKey] = !allChecked;
                });
            }
        });

        this.currentTemplate = "custom";

        // Re-render the category section
        const categorySection = document.querySelector(`[data-category="${categoryId}"]`);
        if (categorySection) {
            const content = categorySection.querySelector('.category-content');
            if (content) {
                content.innerHTML = pages.map(page => this.renderPageCard(page)).join('');
                if (typeof lucide !== "undefined") {
                    lucide.createIcons();
                }
            }
        }

        this.updateSummary();
    }

    /**
     * Apply template permissions (SIMPLIFIED - luôn lấy từ Firebase thông qua templateManager)
     */
    applyTemplate(templateKey, isCustom = false) {
        if (templateKey === "clear") {
            this.currentPermissions = {};
        } else {
            // SIMPLIFIED: Luôn lấy từ templateManager (Firebase)
            // templateManager.templates chứa tất cả templates (cả system và custom)
            if (typeof window.templateManager !== 'undefined' &&
                window.templateManager.templates &&
                window.templateManager.templates[templateKey]?.detailedPermissions) {

                this.currentPermissions = JSON.parse(JSON.stringify(
                    window.templateManager.templates[templateKey].detailedPermissions
                ));
            } else if (typeof PermissionsRegistry !== 'undefined' && PermissionsRegistry.generateTemplatePermissions) {
                // Fallback: Generate từ registry nếu templateManager chưa load
                const templateData = PermissionsRegistry.generateTemplatePermissions(templateKey);
                this.currentPermissions = templateData.detailedPermissions || {};
            }
        }

        this.currentTemplate = templateKey;

        // Re-render grid
        const grid = document.getElementById(`${this.prefix}permissionsGrid`);
        if (grid) {
            grid.innerHTML = this.groupByCategory ? this.renderGroupedByCategory() : this.renderFlatList();
        }

        this.updateSummary();

        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }

        // Show notification
        if (typeof window.notify !== 'undefined' && templateKey !== 'clear') {
            const template = window.templateManager?.templates?.[templateKey] ||
                (typeof PERMISSION_TEMPLATES !== 'undefined' ? PERMISSION_TEMPLATES[templateKey] : null);
            window.notify.success(`Đã áp dụng template "${template?.name || templateKey}"`);
        }
    }

    updateCardCount(pageId) {
        const card = document.querySelector(`[data-page-id="${pageId}"]`);
        if (!card) return;

        const checkboxes = card.querySelectorAll('input[type="checkbox"]');
        const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length;

        card.classList.toggle('has-permissions', checkedCount > 0);

        const countEl = card.querySelector('.perm-count');
        if (countEl) {
            countEl.textContent = `${checkedCount}/${checkboxes.length}`;
        }
    }

    updateSummary() {
        const totalPerms = this.getTotalPermissionsCount();
        let grantedPerms = 0;

        Object.values(this.currentPermissions).forEach(pagePerms => {
            grantedPerms += Object.values(pagePerms).filter(v => v === true).length;
        });

        const percentage = totalPerms > 0 ? Math.round((grantedPerms / totalPerms) * 100) : 0;

        const summaryEl = document.getElementById(`${this.prefix}permissionsSummary`);
        if (summaryEl) {
            const countEl = summaryEl.querySelector('.permissions-count');
            if (countEl) {
                countEl.textContent = `${grantedPerms}/${totalPerms} quyền được chọn`;
            }

            const progressBar = document.getElementById(`${this.prefix}progressBar`);
            if (progressBar) {
                progressBar.style.width = `${percentage}%`;
                progressBar.className = 'progress-bar';
                if (percentage === 0) {
                    progressBar.classList.add('empty');
                } else if (percentage === 100) {
                    progressBar.classList.add('full');
                }
            }
        }
    }

    getPermissions() {
        return this.currentPermissions;
    }

    /**
     * Refresh template buttons (called when custom templates are loaded)
     */
    refreshTemplateButtons() {
        const container = document.getElementById(this.containerId);
        if (!container) return;

        const templateButtonsContainer = container.querySelector('.template-buttons');
        if (templateButtonsContainer) {
            templateButtonsContainer.innerHTML = this.renderTemplateButtons();
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
        }
    }

    setPermissions(permissions) {
        this.currentPermissions = permissions || {};

        // Re-render grid
        const grid = document.getElementById(`${this.prefix}permissionsGrid`);
        if (grid) {
            grid.innerHTML = this.groupByCategory ? this.renderGroupedByCategory() : this.renderFlatList();
            if (typeof lucide !== "undefined") {
                lucide.createIcons();
            }
        }

        this.updateSummary();
    }
}

// =====================================================
// GLOBAL INSTANCES & EVENT HANDLERS
// =====================================================
let editDetailedPermUI = null;
let newDetailedPermUI = null;

// Legacy compatibility - create wrapper instances
let editPermissionsUI = null;
let newPermissionsUI = null;

// Global functions for event handlers (backward compatibility)
function editTogglePermission(pageId, subKey) {
    if (editDetailedPermUI) editDetailedPermUI.togglePermission(pageId, subKey);
}

function editToggleAllForPage(pageId) {
    if (editDetailedPermUI) editDetailedPermUI.toggleAllForPage(pageId);
}

function editApplyTemplate(templateKey) {
    if (editDetailedPermUI) editDetailedPermUI.applyTemplate(templateKey);
}

function newTogglePermission(pageId, subKey) {
    if (newDetailedPermUI) newDetailedPermUI.togglePermission(pageId, subKey);
}

function newToggleAllForPage(pageId) {
    if (newDetailedPermUI) newDetailedPermUI.toggleAllForPage(pageId);
}

function newApplyTemplate(templateKey) {
    if (newDetailedPermUI) newDetailedPermUI.applyTemplate(templateKey);
}

// Initialize on page load
document.addEventListener("DOMContentLoaded", () => {
    // Create new instances with proper prefix
    editDetailedPermUI = new DetailedPermissionsUI("editDetailedPermissions", "edit");
    newDetailedPermUI = new DetailedPermissionsUI("newDetailedPermissions", "new");

    // Expose to window for event handlers
    window.editDetailedPermUI = editDetailedPermUI;
    window.newDetailedPermUI = newDetailedPermUI;

    // Legacy compatibility
    editPermissionsUI = editDetailedPermUI;
    newPermissionsUI = newDetailedPermUI;

    // Render
    editDetailedPermUI.render({});
    newDetailedPermUI.render({});
});

// =====================================================
// CSS STYLES
// =====================================================
const detailedPermissionsStyle = document.createElement("style");
detailedPermissionsStyle.textContent = `
.detailed-permissions-section {
    margin-top: 24px;
    padding: 20px;
    background: var(--bg-secondary, #f9fafb);
    border-radius: 12px;
    border: 1px solid var(--border-color, #e5e7eb);
}

.detailed-permissions-section .section-header {
    margin-bottom: 16px;
}

.detailed-permissions-section .section-header h3 {
    margin: 0 0 8px 0;
    font-size: 16px;
    font-weight: 600;
    color: var(--text-primary, #111827);
    display: flex;
    align-items: center;
    gap: 8px;
}

.perm-count-badge {
    background: var(--accent-color, #6366f1);
    color: white;
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 12px;
    font-weight: 500;
}

.section-desc {
    color: var(--text-tertiary, #6b7280);
    font-size: 13px;
    margin: 0;
}

/* Template Section */
.template-section {
    background: white;
    border-radius: 10px;
    padding: 16px;
    margin-bottom: 16px;
    border: 1px solid var(--border-color, #e5e7eb);
}

.template-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
    font-weight: 500;
    color: var(--text-secondary, #374151);
}

.template-header i {
    width: 16px;
    height: 16px;
}

.template-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}

.template-btn {
    padding: 8px 14px;
    background: white;
    border: 1px solid var(--border-color, #e5e7eb);
    border-radius: 8px;
    font-size: 13px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
    transition: all 0.2s;
    color: var(--text-primary, #111827);
}

.template-btn:hover {
    border-color: var(--template-color, var(--accent-color, #6366f1));
    background: color-mix(in srgb, var(--template-color, #6366f1) 5%, white);
}

.template-btn i {
    width: 14px;
    height: 14px;
    color: var(--template-color, var(--accent-color, #6366f1));
}

.template-btn.clear-btn {
    --template-color: #ef4444;
}

.template-btn.custom-template {
    border-style: dashed;
}

.template-separator {
    color: var(--border-color, #e5e7eb);
    font-weight: 300;
    margin: 0 4px;
    align-self: center;
}

/* Summary Bar */
.permissions-summary-bar {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 12px 16px;
    background: white;
    border-radius: 8px;
    margin-bottom: 16px;
    border: 1px solid var(--border-color, #e5e7eb);
}

.summary-progress {
    flex: 1;
    height: 8px;
    background: var(--bg-tertiary, #e5e7eb);
    border-radius: 4px;
    overflow: hidden;
}

.progress-bar {
    height: 100%;
    background: var(--accent-color, #6366f1);
    border-radius: 4px;
    transition: width 0.3s ease;
}

.progress-bar.empty {
    background: #ef4444;
}

.progress-bar.full {
    background: #10b981;
}

.permissions-count {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-secondary, #374151);
    white-space: nowrap;
}

/* View Toggle */
.detailed-permissions-section .view-toggle {
    display: flex;
    gap: 4px;
    margin-bottom: 16px;
    background: white;
    padding: 4px;
    border-radius: 8px;
    border: 1px solid var(--border-color, #e5e7eb);
    width: fit-content;
}

.detailed-permissions-section .view-btn {
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

.detailed-permissions-section .view-btn.active {
    background: var(--accent-color, #6366f1);
    color: white;
}

.detailed-permissions-section .view-btn i {
    width: 14px;
    height: 14px;
}

/* Category Section */
.category-section {
    margin-bottom: 20px;
    background: white;
    border-radius: 12px;
    border: 1px solid var(--border-color, #e5e7eb);
    overflow: hidden;
}

.category-header-detailed {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 14px 16px;
    background: linear-gradient(135deg, color-mix(in srgb, var(--category-color) 8%, white), white);
    border-bottom: 1px solid var(--border-color, #e5e7eb);
}

.category-info {
    display: flex;
    align-items: center;
    gap: 10px;
    font-weight: 600;
    color: var(--text-primary, #111827);
}

.category-info i {
    width: 20px;
    height: 20px;
    color: var(--category-color, #6366f1);
}

.category-badge {
    background: var(--category-color, #6366f1);
    color: white;
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 12px;
    font-weight: 500;
}

.btn-toggle-category {
    padding: 6px 12px;
    background: white;
    border: 1px solid var(--border-color, #e5e7eb);
    border-radius: 6px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--text-secondary, #374151);
    transition: all 0.2s;
}

.btn-toggle-category:hover {
    background: var(--bg-tertiary, #f3f4f6);
    border-color: var(--category-color, #6366f1);
}

.btn-toggle-category i {
    width: 14px;
    height: 14px;
}

.category-content {
    padding: 16px;
    display: grid;
    gap: 16px;
}

/* Permission Card */
.permission-card-detailed {
    background: var(--bg-secondary, #f9fafb);
    border: 2px solid var(--border-color, #e5e7eb);
    border-radius: 10px;
    overflow: hidden;
    transition: all 0.2s;
}

.permission-card-detailed:hover {
    border-color: var(--category-color, var(--accent-color, #6366f1));
}

.permission-card-detailed.has-permissions {
    border-color: var(--category-color, var(--accent-color, #6366f1));
    background: linear-gradient(135deg, color-mix(in srgb, var(--category-color) 3%, white), white);
}

.permission-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding: 14px 16px;
    background: white;
    border-bottom: 1px solid var(--border-color, #e5e7eb);
}

.permission-title {
    display: flex;
    gap: 12px;
    align-items: flex-start;
}

.page-icon-wrapper {
    width: 40px;
    height: 40px;
    background: color-mix(in srgb, var(--category-color, #6366f1) 10%, white);
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
}

.page-icon-wrapper .page-icon {
    width: 20px;
    height: 20px;
    color: var(--category-color, var(--accent-color, #6366f1));
}

.page-details h4 {
    margin: 0 0 4px 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary, #111827);
}

.permission-desc {
    margin: 0;
    font-size: 12px;
    color: var(--text-tertiary, #6b7280);
}

.permission-actions {
    display: flex;
    align-items: center;
    gap: 10px;
}

.perm-count {
    font-size: 12px;
    font-weight: 500;
    color: var(--text-tertiary, #6b7280);
    background: var(--bg-secondary, #f3f4f6);
    padding: 4px 10px;
    border-radius: 12px;
}

.toggle-all-btn {
    width: 32px;
    height: 32px;
    background: white;
    border: 1px solid var(--border-color, #e5e7eb);
    border-radius: 6px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
}

.toggle-all-btn:hover {
    background: var(--bg-tertiary, #f3f4f6);
    border-color: var(--category-color, #6366f1);
}

.toggle-all-btn i {
    width: 16px;
    height: 16px;
    color: var(--text-secondary, #374151);
}

.toggle-all-btn.active {
    background: var(--category-color, #6366f1);
    border-color: var(--category-color, #6366f1);
}

.toggle-all-btn.active i {
    color: white;
}

/* Access Badge - Page access indicator */
.access-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    font-weight: 600;
    padding: 3px 8px;
    border-radius: 12px;
    margin-top: 6px;
}

.access-badge i {
    width: 12px;
    height: 12px;
}

.access-badge.access-granted {
    background: #dcfce7;
    color: #16a34a;
}

.access-badge.access-denied {
    background: #fee2e2;
    color: #dc2626;
}

/* Sub Permissions */
.sub-permissions {
    padding: 12px 16px;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}

.sub-perm-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: white;
    border: 1px solid var(--border-color, #e5e7eb);
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.15s;
    font-size: 13px;
}

.sub-perm-item:hover {
    border-color: var(--category-color, var(--accent-color, #6366f1));
    background: color-mix(in srgb, var(--category-color, #6366f1) 3%, white);
}

.sub-perm-item.checked {
    background: color-mix(in srgb, var(--category-color, #6366f1) 10%, white);
    border-color: var(--category-color, var(--accent-color, #6366f1));
}

.sub-perm-item input[type="checkbox"] {
    width: 16px;
    height: 16px;
    cursor: pointer;
    accent-color: var(--category-color, var(--accent-color, #6366f1));
}

.sub-perm-icon {
    width: 14px;
    height: 14px;
    color: var(--category-color, var(--accent-color, #6366f1));
}

.sub-perm-name {
    color: var(--text-primary, #111827);
    font-weight: 500;
}

.sub-perm-desc {
    color: var(--text-tertiary, #6b7280);
    font-size: 11px;
    margin-left: auto;
}

@media (max-width: 768px) {
    .template-buttons {
        flex-direction: column;
    }

    .template-btn {
        width: 100%;
        justify-content: center;
    }

    .sub-permissions {
        flex-direction: column;
    }

    .sub-perm-item {
        width: 100%;
    }
}
`;
document.head.appendChild(detailedPermissionsStyle);

console.log("[Detailed Permissions UI] Loaded - Using permissions-registry.js");
