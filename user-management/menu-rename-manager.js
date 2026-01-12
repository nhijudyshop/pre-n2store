/* =====================================================
   MENU RENAME MANAGER
   Allows admin to customize menu item names
   ===================================================== */

class MenuRenameManager {
    constructor() {
        this.container = null;
        this.menuConfig = [];
        this.customNames = {};
        this.init();
    }

    init() {
        // Wait for MenuNameUtils to be available
        if (window.MenuNameUtils) {
            this.menuConfig = window.MenuNameUtils.MENU_CONFIG || [];
            this.customNames = window.MenuNameUtils.getCustomMenuNames() || {};
        } else {
            console.warn('[Menu Rename] MenuNameUtils not yet loaded, retrying...');
            setTimeout(() => this.init(), 100);
            return;
        }
        console.log('[Menu Rename] Initialized with', this.menuConfig.length, 'menu items');
    }

    renderUI(containerId) {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            console.error('[Menu Rename] Container not found:', containerId);
            return;
        }

        // Always reload from MenuNameUtils before rendering
        if (window.MenuNameUtils) {
            this.menuConfig = window.MenuNameUtils.MENU_CONFIG || [];
            this.customNames = window.MenuNameUtils.getCustomMenuNames() || {};
            console.log('[Menu Rename] Loaded', this.menuConfig.length, 'menu items for rendering');
        } else {
            console.error('[Menu Rename] MenuNameUtils not available, cannot render menu list');
            this.container.innerHTML = `
                <section class="card">
                    <div class="card-body">
                        <div class="empty-state show">
                            <i data-lucide="alert-circle"></i>
                            <h3>Lỗi tải dữ liệu</h3>
                            <p>Không thể tải danh sách menu. Vui lòng refresh trang.</p>
                        </div>
                    </div>
                </section>
            `;
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
            return;
        }

        const html = `
            <section class="card">
                <div class="card-header">
                    <div class="card-title">
                        <i data-lucide="edit-3"></i>
                        <h2>Đổi Tên Menu</h2>
                    </div>
                    <div class="card-actions">
                        <button class="btn btn-secondary" id="resetMenuNames">
                            <i data-lucide="rotate-ccw"></i>
                            Khôi Phục Mặc Định
                        </button>
                        <button class="btn btn-primary" id="saveMenuNames">
                            <i data-lucide="save"></i>
                            Lưu Thay Đổi
                        </button>
                    </div>
                </div>
                <div class="card-body">
                    <div class="menu-rename-info" style="
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        border-radius: var(--radius-lg);
                        padding: var(--spacing-lg);
                        color: white;
                        margin-bottom: var(--spacing-xl);
                    ">
                        <div style="display: flex; align-items: center; gap: var(--spacing-sm); margin-bottom: var(--spacing-sm);">
                            <i data-lucide="info" style="width: 20px; height: 20px;"></i>
                            <strong>Hướng dẫn</strong>
                        </div>
                        <ul style="margin: 0; padding-left: var(--spacing-xl); line-height: 1.8;">
                            <li>Nhập tên mới vào ô tương ứng để đổi tên menu</li>
                            <li>Để trống sẽ giữ nguyên tên gốc</li>
                            <li>Nhấn "Lưu Thay Đổi" để áp dụng</li>
                            <li>Thay đổi sẽ áp dụng cho tất cả người dùng</li>
                        </ul>
                    </div>

                    <div class="menu-rename-table" style="
                        background: var(--gray-50);
                        border-radius: var(--radius-lg);
                        overflow: hidden;
                    ">
                        <table style="width: 100%; border-collapse: collapse;">
                            <thead>
                                <tr style="background: var(--gray-100);">
                                    <th style="padding: 12px 16px; text-align: left; font-weight: 600; color: var(--gray-700); width: 50px;">Icon</th>
                                    <th style="padding: 12px 16px; text-align: left; font-weight: 600; color: var(--gray-700); width: 180px;">Tên Gốc</th>
                                    <th style="padding: 12px 16px; text-align: left; font-weight: 600; color: var(--gray-700);">Tên Đầy Đủ Mới</th>
                                    <th style="padding: 12px 16px; text-align: left; font-weight: 600; color: var(--gray-700); width: 150px;">Tên Ngắn (Mobile)</th>
                                </tr>
                            </thead>
                            <tbody id="menuRenameBody">
                                ${this.renderMenuRows()}
                            </tbody>
                        </table>
                    </div>
                </div>
            </section>
        `;

        this.container.innerHTML = html;
        this.bindEvents();

        // Re-initialize Lucide icons
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    renderMenuRows() {
        return this.menuConfig.map((item, index) => {
            const customName = this.customNames[item.pageIdentifier] || {};
            const hasCustomText = customName.text && customName.text !== item.text;
            const hasCustomShort = customName.shortText && customName.shortText !== item.shortText;

            return `
                <tr style="border-bottom: 1px solid var(--gray-200); ${index % 2 === 1 ? 'background: white;' : ''}">
                    <td style="padding: 12px 16px;">
                        <div style="
                            width: 36px;
                            height: 36px;
                            background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
                            border-radius: 8px;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            color: white;
                        ">
                            <i data-lucide="${item.icon}" style="width: 18px; height: 18px;"></i>
                        </div>
                    </td>
                    <td style="padding: 12px 16px;">
                        <div style="font-weight: 600; color: var(--gray-800);">${item.text}</div>
                        <div style="font-size: 12px; color: var(--gray-500);">Ngắn: ${item.shortText || item.text}</div>
                    </td>
                    <td style="padding: 12px 16px;">
                        <input 
                            type="text" 
                            class="menu-text-input"
                            data-identifier="${item.pageIdentifier}"
                            data-field="text"
                            placeholder="${item.text}"
                            value="${hasCustomText ? customName.text : ''}"
                            style="
                                width: 100%;
                                padding: 10px 14px;
                                border: 2px solid ${hasCustomText ? '#10b981' : 'var(--gray-200)'};
                                border-radius: var(--radius-md);
                                font-size: 14px;
                                transition: all 0.2s;
                                background: ${hasCustomText ? '#ecfdf5' : 'white'};
                            "
                        />
                    </td>
                    <td style="padding: 12px 16px;">
                        <input 
                            type="text" 
                            class="menu-short-input"
                            data-identifier="${item.pageIdentifier}"
                            data-field="shortText"
                            placeholder="${item.shortText || item.text}"
                            value="${hasCustomShort ? customName.shortText : ''}"
                            style="
                                width: 100%;
                                padding: 10px 14px;
                                border: 2px solid ${hasCustomShort ? '#10b981' : 'var(--gray-200)'};
                                border-radius: var(--radius-md);
                                font-size: 14px;
                                transition: all 0.2s;
                                background: ${hasCustomShort ? '#ecfdf5' : 'white'};
                            "
                        />
                    </td>
                </tr>
            `;
        }).join('');
    }

    bindEvents() {
        // Save button
        const saveBtn = document.getElementById('saveMenuNames');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => this.saveChanges());
        }

        // Reset button
        const resetBtn = document.getElementById('resetMenuNames');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => this.resetToDefaults());
        }

        // Input change highlighting
        const inputs = this.container.querySelectorAll('input[data-identifier]');
        inputs.forEach(input => {
            input.addEventListener('input', (e) => {
                const hasValue = e.target.value.trim().length > 0;
                e.target.style.borderColor = hasValue ? '#10b981' : 'var(--gray-200)';
                e.target.style.background = hasValue ? '#ecfdf5' : 'white';
            });
        });
    }

    async saveChanges() {
        const newCustomNames = {};

        const inputs = this.container.querySelectorAll('input[data-identifier]');
        inputs.forEach(input => {
            const identifier = input.dataset.identifier;
            const field = input.dataset.field;
            const value = input.value.trim();

            if (value) {
                if (!newCustomNames[identifier]) {
                    newCustomNames[identifier] = {};
                }
                newCustomNames[identifier][field] = value;
            }
        });

        // Save to Firebase and localStorage (async)
        if (window.MenuNameUtils && window.MenuNameUtils.saveCustomMenuNames) {
            // Show loading state
            const saveBtn = document.getElementById('saveMenuNames');
            if (saveBtn) {
                saveBtn.disabled = true;
                saveBtn.innerHTML = '<i data-lucide="loader"></i> Đang lưu...';
                if (typeof lucide !== 'undefined') lucide.createIcons();
            }

            try {
                const success = await window.MenuNameUtils.saveCustomMenuNames(newCustomNames);

                if (success) {
                    this.customNames = newCustomNames;

                    // Refresh the navigation sidebar immediately
                    if (window.navigationManager && typeof window.navigationManager.renderNavigation === 'function') {
                        window.navigationManager.renderNavigation();
                        if (typeof lucide !== 'undefined') {
                            lucide.createIcons();
                        }
                    }

                    // Show success notification
                    if (window.notify) {
                        window.notify.success('Đã lưu và sync lên Firebase thành công!');
                    }
                } else {
                    if (window.notify) {
                        window.notify.error('Lỗi khi lưu thay đổi!');
                    } else {
                        alert('Lỗi khi lưu thay đổi!');
                    }
                }
            } catch (error) {
                console.error('[Menu Rename] Save error:', error);
                if (window.notify) {
                    window.notify.error('Lỗi khi lưu: ' + error.message);
                }
            } finally {
                // Restore button state
                if (saveBtn) {
                    saveBtn.disabled = false;
                    saveBtn.innerHTML = '<i data-lucide="save"></i> Lưu Thay Đổi';
                    if (typeof lucide !== 'undefined') lucide.createIcons();
                }
            }
        }
    }

    async resetToDefaults() {
        if (!confirm('Bạn có chắc muốn khôi phục tất cả tên menu về mặc định?')) {
            return;
        }

        const resetBtn = document.getElementById('resetMenuNames');
        if (resetBtn) {
            resetBtn.disabled = true;
            resetBtn.innerHTML = '<i data-lucide="loader"></i> Đang xóa...';
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }

        try {
            // Save empty object to Firebase (sync the reset)
            if (window.MenuNameUtils && window.MenuNameUtils.saveCustomMenuNames) {
                await window.MenuNameUtils.saveCustomMenuNames({});
            }

            this.customNames = {};

            // Re-render UI
            this.renderUI(this.container.id);

            // Refresh navigation sidebar
            if (window.navigationManager && typeof window.navigationManager.renderNavigation === 'function') {
                window.navigationManager.renderNavigation();
                if (typeof lucide !== 'undefined') {
                    lucide.createIcons();
                }
            }

            if (window.notify) {
                window.notify.success('Đã khôi phục tên menu về mặc định và sync lên Firebase!');
            }
        } catch (error) {
            console.error('[Menu Rename] Reset error:', error);
            if (window.notify) {
                window.notify.error('Lỗi khi khôi phục: ' + error.message);
            }
        } finally {
            if (resetBtn) {
                resetBtn.disabled = false;
                resetBtn.innerHTML = '<i data-lucide="rotate-ccw"></i> Khôi Phục Mặc Định';
                if (typeof lucide !== 'undefined') lucide.createIcons();
            }
        }
    }
}

// Initialize and export
window.MenuRenameManager = MenuRenameManager;

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.menuRenameManager = new MenuRenameManager();
});
