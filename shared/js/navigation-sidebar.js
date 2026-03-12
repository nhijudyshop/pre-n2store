/* =====================================================
   NAVIGATION SIDEBAR - Desktop sidebar rendering, menu building, UI components
   Sub-module of navigation-modern.js
   Load order: 3 (after config, permissions)
   Dependencies: navigation-config.js (MENU_CONFIG, MenuLayoutStore, getMenuDisplayName)
                 navigation-permissions.js (getDefaultAdminPermissions)
   ===================================================== */

// =====================================================
// UnifiedNavigationManager - Sidebar/Desktop methods
// Attached as mixin to the class defined in navigation-core.js
// =====================================================

window._navigationSidebarMixin = {

    // =====================================================
    // DESKTOP NAVIGATION
    // =====================================================

    renderDesktopNavigation() {
        console.log("[Unified Nav] Rendering desktop UI...");

        // Auto-create sidebar + main-content wrapper if page doesn't have them
        this.ensureDesktopStructure();

        const sidebar = document.getElementById("sidebar");
        if (sidebar) {
            sidebar.style.display = "";
        }

        const topBar = document.querySelector(".mobile-top-bar");
        const bottomNav = document.querySelector(".mobile-bottom-nav");
        if (topBar) topBar.remove();
        if (bottomNav) bottomNav.remove();

        const mainContent = document.querySelector(".main-content");
        if (mainContent) {
            mainContent.style.paddingTop = "";
            mainContent.style.paddingBottom = "";
        }

        this.updateSidebarLogo();
        this.initShopSelector();
        this.renderDesktopSidebar();
        this.initializeSidebarToggle();
    },

    /**
     * Auto-create sidebar HTML + inject CSS for pages that don't have sidebar markup.
     * Makes navigation-modern.js plug-and-play: just add <script defer src="navigation-modern.js">
     */
    ensureDesktopStructure() {
        if (document.getElementById("sidebar")) return; // Already has sidebar

        console.log("[Unified Nav] Sidebar not found, auto-creating...");

        // Inject sidebar CSS (with hardcoded fallbacks for pages without modern.css)
        this.injectSidebarStyles();

        // Compute logo path from script src
        const scriptTag = document.querySelector('script[src*="navigation-modern"]') || document.querySelector('script[src*="navigation-core"]');
        let logoPath = '../shared/images/logo.jpg';
        if (scriptTag) {
            const src = scriptTag.getAttribute('src');
            logoPath = src.replace(/js\/navigation-(modern|core)\.js/, 'images/logo.jpg');
        }

        // Create sidebar HTML
        const sidebar = document.createElement('aside');
        sidebar.className = 'sidebar';
        sidebar.id = 'sidebar';
        sidebar.innerHTML = `
            <div class="sidebar-header">
                <div class="logo">
                    <img src="${logoPath}" alt="N2STORE" class="sidebar-logo-img">
                    <span>N2STORE</span>
                </div>
                <button class="sidebar-toggle" id="sidebarToggle">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/></svg>
                </button>
            </div>
            <nav class="sidebar-nav" id="sidebarNav"></nav>
            <div class="sidebar-footer">
                <div class="user-info">
                    <div class="user-avatar">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="10" r="3"/><path d="M7 20.662V19a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1.662"/></svg>
                    </div>
                    <div class="user-details">
                        <div class="user-name" id="userName">Admin</div>
                        <div class="user-role">Quản trị viên</div>
                    </div>
                </div>
                <button class="btn-permissions" id="btnPermissions">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></svg>
                    <span>Xem Quyền Của Tôi</span>
                </button>
                <button class="btn-logout" id="btnLogout">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>
                    <span>Đăng xuất</span>
                </button>
            </div>
        `;

        // Wrap existing body content in main-content
        const mainContent = document.querySelector('.main-content');
        if (!mainContent) {
            const wrapper = document.createElement('main');
            wrapper.className = 'main-content';
            // Move all body children into wrapper (except scripts that shouldn't move)
            while (document.body.firstChild) {
                wrapper.appendChild(document.body.firstChild);
            }
            document.body.appendChild(sidebar);
            document.body.appendChild(wrapper);
        } else {
            document.body.insertBefore(sidebar, document.body.firstChild);
        }

        console.log("[Unified Nav] Sidebar auto-created successfully");
    },

    /**
     * Inject sidebar CSS for pages that don't have modern.css
     */
    injectSidebarStyles() {
        if (document.getElementById('unified-nav-sidebar-styles')) return;
        const style = document.createElement('style');
        style.id = 'unified-nav-sidebar-styles';
        style.textContent = `
            /* CSS Variables fallbacks for pages without modern.css */
            :root {
                --sidebar-width: var(--sidebar-width, 260px);
                --surface: var(--surface, #ffffff);
                --border: var(--border, #e5e7eb);
                --primary: var(--primary, #6366f1);
                --primary-dark: var(--primary-dark, #4f46e5);
                --gray-50: var(--gray-50, #f9fafb);
                --gray-100: var(--gray-100, #f3f4f6);
                --gray-200: var(--gray-200, #e5e7eb);
                --gray-300: var(--gray-300, #d1d5db);
                --text-primary: var(--text-primary, #111827);
                --text-secondary: var(--text-secondary, #4b5563);
                --text-tertiary: var(--text-tertiary, #9ca3af);
                --danger: var(--danger, #ef4444);
                --spacing-xs: var(--spacing-xs, 0.25rem);
                --spacing-sm: var(--spacing-sm, 0.5rem);
                --spacing-md: var(--spacing-md, 1rem);
                --spacing-lg: var(--spacing-lg, 1.5rem);
                --radius: var(--radius, 0.5rem);
                --radius-lg: var(--radius-lg, 1rem);
                --transition-fast: var(--transition-fast, 150ms ease);
                --transition: var(--transition, 200ms ease);
                --transition-slow: var(--transition-slow, 300ms ease);
                --shadow-lg: var(--shadow-lg, 0 10px 15px -3px rgb(0 0 0 / 0.1));
                --shadow-xl: var(--shadow-xl, 0 20px 25px -5px rgb(0 0 0 / 0.1));
            }

            .sidebar {
                position: fixed;
                left: 0;
                top: 0;
                width: 260px;
                width: var(--sidebar-width, 260px);
                height: 100vh;
                background: var(--surface, #fff);
                border-right: 1px solid var(--border, #e5e7eb);
                display: flex;
                flex-direction: column;
                z-index: 1000;
                transition: transform 300ms ease;
                font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            }
            .sidebar.collapsed { transform: translateX(-100%); }

            .sidebar-header {
                padding: 1.5rem;
                border-bottom: 1px solid var(--border, #e5e7eb);
                display: flex;
                align-items: center;
                justify-content: space-between;
            }
            .sidebar-header .logo {
                display: flex;
                align-items: center;
                gap: 1rem;
                font-size: 1.25rem;
                font-weight: 700;
                color: var(--primary, #6366f1);
            }
            .sidebar-logo-img {
                width: 32px;
                height: 32px;
                object-fit: contain;
                border-radius: 6px;
            }
            .sidebar-toggle {
                width: 36px; height: 36px;
                border: none; background: transparent;
                color: var(--text-secondary, #4b5563);
                border-radius: 0.5rem;
                display: flex; align-items: center; justify-content: center;
                cursor: pointer;
                transition: 150ms ease;
            }
            .sidebar-toggle:hover { background: var(--gray-100, #f3f4f6); }

            .sidebar-nav {
                flex: 1;
                padding: 1.5rem;
                overflow-y: auto;
                overflow-x: hidden;
            }
            .sidebar-nav::-webkit-scrollbar { width: 6px; }
            .sidebar-nav::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 3px; }

            .sidebar-footer {
                padding: 1.5rem;
                border-top: 1px solid var(--border, #e5e7eb);
            }
            .user-info {
                display: flex; align-items: center; gap: 1rem;
                margin-bottom: 1rem;
            }
            .user-avatar {
                width: 40px; height: 40px; border-radius: 50%;
                background: var(--gray-100, #f3f4f6);
                display: flex; align-items: center; justify-content: center;
                color: var(--primary, #6366f1);
                flex-shrink: 0;
            }
            .user-details { flex: 1; min-width: 0; }
            .user-name {
                font-weight: 600; color: var(--text-primary, #111827);
                overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
            }
            .user-role { font-size: 0.75rem; color: var(--text-tertiary, #9ca3af); }

            .btn-permissions, .btn-logout {
                width: 100%; padding: 1rem; border: none; border-radius: 0.5rem;
                font-weight: 500; font-size: 0.875rem;
                display: flex; align-items: center; justify-content: center; gap: 0.5rem;
                cursor: pointer; transition: 150ms ease;
            }
            .btn-permissions {
                background: var(--gray-100, #f3f4f6);
                color: var(--text-primary, #111827);
                margin-bottom: 0.5rem;
            }
            .btn-permissions:hover { background: var(--gray-200, #e5e7eb); }
            .btn-logout { background: var(--danger, #ef4444); color: white; }
            .btn-logout:hover { background: #dc2626; }

            .main-content {
                margin-left: 260px;
                margin-left: var(--sidebar-width, 260px);
                min-height: 100vh;
                transition: margin-left 300ms ease;
            }
            .sidebar.collapsed ~ .main-content { margin-left: 0; }

            .sidebar-toggle-fixed {
                position: fixed; left: 20px; top: 20px;
                width: 48px; height: 48px;
                border-radius: 1rem; background: var(--primary, #6366f1);
                color: white; border: none;
                box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1);
                display: none; align-items: center; justify-content: center;
                cursor: pointer; z-index: 1001;
                transition: all 200ms ease;
            }
            .sidebar-toggle-fixed:hover {
                background: var(--primary-dark, #4f46e5);
                transform: scale(1.05);
            }
        `;
        document.head.appendChild(style);
    },

    /**
     * Replace sidebar header logo icon with N2STORE logo image
     */
    updateSidebarLogo() {
        const logoEl = document.querySelector('.sidebar-header .logo');
        if (!logoEl) return;

        // Compute logo path from navigation-modern.js script src
        const scriptTag = document.querySelector('script[src*="navigation-modern"]') || document.querySelector('script[src*="navigation-core"]');
        let logoPath = '../shared/images/logo.jpg';
        if (scriptTag) {
            const src = scriptTag.getAttribute('src');
            logoPath = src.replace(/js\/navigation-(modern|core)\.js/, 'images/logo.jpg');
        }

        logoEl.innerHTML = `
            <img src="${logoPath}" alt="N2STORE" class="sidebar-logo-img">
            <span>N2STORE</span>
        `;
    },

    /**
     * Initialize shop selector (NJD LIVE / NJD SHOP) in sidebar header
     */
    initShopSelector() {
        const header = document.querySelector('.sidebar-header');
        if (!header || !window.ShopConfig) return;

        // Remove existing shop selector if any (from HTML or previous render)
        const existing = header.querySelector('.shop-selector');
        if (existing) existing.remove();

        // Create shop selector
        const select = document.createElement('select');
        select.className = 'shop-selector';
        select.id = 'shopSelector';

        window.ShopConfig.getShops().forEach(shop => {
            const opt = document.createElement('option');
            opt.value = shop.id;
            opt.textContent = shop.label;
            select.appendChild(opt);
        });

        select.value = window.ShopConfig.getSelectedShopId();

        select.addEventListener('change', (e) => {
            window.ShopConfig.setShop(e.target.value);
            console.log('[ShopSelector] Switched to:', e.target.value);
            // Reload page to re-init TokenManager with new company
            // Pages that handle shop change in-place (e.g. purchase-orders)
            // should set window._shopChangeNoReload = true before this fires
            if (!window._shopChangeNoReload) {
                window.location.reload();
            }
        });

        // Insert after logo, before toggle button
        const toggle = header.querySelector('.sidebar-toggle');
        if (toggle) {
            header.insertBefore(select, toggle);
        } else {
            header.appendChild(select);
        }

        // Inject shop selector styles
        this.injectShopSelectorStyles();
    },

    /**
     * Inject CSS for shop selector
     */
    injectShopSelectorStyles() {
        if (document.getElementById('shop-selector-styles')) return;
        const style = document.createElement('style');
        style.id = 'shop-selector-styles';
        style.textContent = `
            .shop-selector {
                padding: 4px 8px;
                border: 1px solid #d1d5db;
                border-radius: 6px;
                font-size: 12px;
                font-weight: 600;
                color: #374151;
                background: #f9fafb;
                cursor: pointer;
                outline: none;
                transition: border-color 0.2s;
                -webkit-appearance: none;
                appearance: none;
                background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
                background-repeat: no-repeat;
                background-position: right 6px center;
                padding-right: 22px;
            }
            .shop-selector:hover {
                border-color: #6366f1;
            }
            .shop-selector:focus {
                border-color: #6366f1;
                box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.2);
            }
            .sidebar.collapsed .shop-selector {
                display: none;
            }
            .mobile-shop-selector {
                margin-left: auto;
                margin-right: 8px;
                font-size: 11px;
                padding: 3px 20px 3px 6px;
            }
        `;
        document.head.appendChild(style);
    },

    renderDesktopSidebar() {
        console.log("[Unified Nav] Rendering desktop sidebar...");

        const sidebarNav = document.querySelector(".sidebar-nav");
        if (!sidebarNav) {
            console.error("[Unified Nav] Sidebar nav element not found!");
            return;
        }

        sidebarNav.innerHTML = "";

        // Inject grouped menu styles
        this.injectGroupedMenuStyles();

        // Get filtered layout based on user permissions
        const filteredLayout = MenuLayoutStore.getFilteredLayout(this.userPermissions);
        let renderedCount = 0;

        // Create groups container
        const groupsContainer = document.createElement("div");
        groupsContainer.className = "menu-groups-container";
        groupsContainer.id = "menuGroupsContainer";

        // Render each group
        filteredLayout.groups.forEach((group) => {
            const groupEl = this.createGroupElement(group);
            groupsContainer.appendChild(groupEl);
            renderedCount += group.items.length;
        });

        // Render ungrouped items if any
        if (filteredLayout.ungroupedItems && filteredLayout.ungroupedItems.length > 0) {
            const ungroupedGroup = {
                id: 'ungrouped',
                name: 'Chưa phân nhóm',
                icon: 'more-horizontal',
                collapsed: false,
                items: filteredLayout.ungroupedItems
            };
            const ungroupedEl = this.createGroupElement(ungroupedGroup, true);
            groupsContainer.appendChild(ungroupedEl);
            renderedCount += filteredLayout.ungroupedItems.length;
        }

        sidebarNav.appendChild(groupsContainer);

        console.log(
            `[Unified Nav] Rendered ${renderedCount} desktop menu items in ${filteredLayout.groups.length} groups`,
        );

        this.addSettingsToNavigation(sidebarNav);

        if (typeof lucide !== "undefined") {
            lucide.createIcons();
            console.log("[Unified Nav] Lucide icons initialized");
        }

        // Setup event listeners
        this.setupGroupCollapseListeners();

    },

    /**
     * Setup group collapse/expand listeners
     */
    setupGroupCollapseListeners() {
        document.querySelectorAll('.menu-group-header').forEach(header => {
            header.addEventListener('click', (e) => {
                const groupEl = header.closest('.menu-group');
                const groupId = groupEl.dataset.groupId;
                const isCollapsed = groupEl.classList.toggle('collapsed');
                this.saveGroupCollapsedState(groupId, isCollapsed);
            });
        });
    },

    /**
     * Create a group element with header and items (for sidebar display only)
     */
    createGroupElement(group, isUngrouped = false) {
        const groupEl = document.createElement("div");
        groupEl.className = `menu-group`;
        groupEl.dataset.groupId = group.id;

        // Always start collapsed on page load
        groupEl.classList.add('collapsed');

        // But expand the group containing the active page
        const hasActivePage = group.items.some(item => item.pageIdentifier === this.currentPage);
        if (hasActivePage) groupEl.classList.remove('collapsed');

        // Group header
        const header = document.createElement("div");
        header.className = "menu-group-header";
        header.innerHTML = `
            <span class="group-collapse-icon"><i data-lucide="chevron-down"></i></span>
            <i data-lucide="${group.icon}" class="group-icon"></i>
            <span class="group-name">${group.name}</span>
            <span class="group-count">${group.items.length}</span>
        `;
        groupEl.appendChild(header);

        // Group items container
        const itemsContainer = document.createElement("div");
        itemsContainer.className = "menu-group-items";

        group.items.forEach((menuItem) => {
            const navItem = document.createElement("a");
            navItem.href = menuItem.href;
            navItem.className = "nav-item";

            if (menuItem.pageIdentifier === this.currentPage) {
                navItem.classList.add("active");
            }

            navItem.innerHTML = `
                <i data-lucide="${menuItem.icon}"></i>
                <span>${menuItem.text}</span>
            `;

            itemsContainer.appendChild(navItem);
        });

        groupEl.appendChild(itemsContainer);
        return groupEl;
    },

    /**
     * Get group collapsed state from localStorage
     */
    getGroupCollapsedState() {
        try {
            const state = localStorage.getItem('n2shop_menu_group_collapsed');
            return state ? JSON.parse(state) : {};
        } catch (e) {
            return {};
        }
    },

    /**
     * Save group collapsed state to localStorage
     */
    saveGroupCollapsedState(groupId, isCollapsed) {
        try {
            const state = this.getGroupCollapsedState();
            state[groupId] = isCollapsed;
            localStorage.setItem('n2shop_menu_group_collapsed', JSON.stringify(state));
        } catch (e) {
            console.error('[Menu] Error saving collapsed state:', e);
        }
    },

    /**
     * Inject CSS styles for grouped menus
     */
    injectGroupedMenuStyles() {
        if (document.getElementById('groupedMenuStyles')) return;

        const style = document.createElement('style');
        style.id = 'groupedMenuStyles';
        style.textContent = `
            /* Sidebar Logo */
            .sidebar-logo-img {
                width: 32px;
                height: 32px;
                object-fit: contain;
                border-radius: 6px;
            }

            /* Edit Controls */
            .menu-edit-controls {
                padding: 8px 12px;
                border-bottom: 1px solid var(--border, rgba(0,0,0,0.1));
                margin-bottom: 8px;
            }
            .menu-edit-toggle {
                display: flex;
                align-items: center;
                gap: 8px;
                width: 100%;
                padding: 8px 12px;
                background: rgba(99, 102, 241, 0.1);
                border: 1px solid rgba(99, 102, 241, 0.3);
                border-radius: 8px;
                color: #6366f1;
                cursor: pointer;
                font-size: 13px;
                transition: all 0.2s;
            }
            .menu-edit-toggle:hover {
                background: rgba(99, 102, 241, 0.2);
            }
            .menu-edit-toggle i {
                width: 16px;
                height: 16px;
            }

            /* Groups Container */
            .menu-groups-container {
                display: flex;
                flex-direction: column;
                gap: 4px;
            }

            /* Group */
            .menu-group {
                border-radius: 8px;
                overflow: hidden;
            }
            .menu-group-header {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 10px 12px;
                background: var(--gray-100, rgba(0,0,0,0.03));
                cursor: pointer;
                user-select: none;
                transition: background 0.2s;
                border-radius: 8px;
                margin-bottom: 2px;
            }
            .menu-group-header:hover {
                background: var(--gray-200, rgba(0,0,0,0.06));
            }
            .group-collapse-icon {
                width: 16px;
                height: 16px;
                display: flex;
                align-items: center;
                justify-content: center;
                color: var(--text-secondary, #64748b);
                transition: transform 0.2s ease;
            }
            .menu-group.collapsed .group-collapse-icon {
                transform: rotate(-90deg);
            }
            .group-collapse-icon i,
            .group-collapse-icon svg {
                width: 14px;
                height: 14px;
                stroke-width: 2.5;
            }
            .group-icon {
                width: 16px;
                height: 16px;
                color: #6366f1;
            }
            .group-name {
                flex: 1;
                font-size: 11px;
                font-weight: 600;
                color: var(--text-secondary, #64748b);
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            .group-count {
                font-size: 10px;
                color: var(--text-secondary, #64748b);
                background: var(--gray-200, rgba(0,0,0,0.06));
                padding: 2px 6px;
                border-radius: 10px;
            }

            /* Group Items */
            .menu-group-items {
                padding-left: 8px;
                overflow: hidden;
                transition: max-height 0.3s ease;
            }
            .menu-group.collapsed .menu-group-items {
                display: none;
            }
            .menu-group-items .nav-item {
                padding-left: 20px;
                font-size: 13px;
            }

        `;
        document.head.appendChild(style);
    },

    addSettingsToNavigation(sidebarNav) {
        const divider = document.createElement("div");
        divider.className = "nav-divider";
        divider.innerHTML =
            '<hr style="border: none; border-top: 1px solid var(--border, rgba(0,0,0,0.1)); margin: 16px 0;">';
        sidebarNav.appendChild(divider);

        const settingsBtn = document.createElement("button");
        settingsBtn.id = "btnSettings";
        settingsBtn.className = "nav-item nav-settings-btn";
        settingsBtn.innerHTML = `
            <i data-lucide="settings"></i>
            <span>Cài Đặt</span>
        `;
        sidebarNav.appendChild(settingsBtn);

        if (!document.getElementById("settingsNavStyles")) {
            const style = document.createElement("style");
            style.id = "settingsNavStyles";
            style.textContent = `
                .nav-settings-btn {
                    background: none !important;
                    border: none;
                    width: 100%;
                    text-align: left;
                    cursor: pointer;
                    margin-top: 8px;
                }
                .nav-settings-btn:hover {
                    background: rgba(255, 255, 255, 0.1) !important;
                }
                .nav-settings-btn i {
                    color: #fbbf24;
                }
            `;
            document.head.appendChild(style);
        }

        console.log("[Unified Nav] Settings button added");
    },

    // =====================================================
    // MENU EDIT MODAL (Admin Only)
    // =====================================================

    /**
     * Load SortableJS library dynamically
     */
    async loadSortableJS() {
        if (window.Sortable) return true;

        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/sortablejs@1.15.0/Sortable.min.js';
            script.onload = () => resolve(true);
            script.onerror = () => reject(new Error('Failed to load SortableJS'));
            document.head.appendChild(script);
        });
    },

    /**
     * Show menu edit modal (full screen)
     */
    async showMenuEditModal() {
        if (!this.isAdminTemplate) {
            alert('Chỉ admin mới có thể chỉnh sửa menu');
            return;
        }

        // Load SortableJS first
        await this.loadSortableJS();

        // Get current layout with any new menu items included
        const rawLayout = MenuLayoutStore.getLayout();
        const layout = MenuLayoutStore._addNewMenuItems(rawLayout);
        MenuLayoutStore.setEditing(true);

        // Create modal
        const modal = document.createElement('div');
        modal.className = 'menu-edit-modal-overlay';
        modal.id = 'menuEditModal';

        // Build groups HTML
        const groupsHtml = layout.groups.map(group => `
            <div class="edit-group" data-group-id="${group.id}">
                <div class="edit-group-header">
                    <span class="edit-group-drag-handle"><i data-lucide="grip-vertical"></i></span>
                    <i data-lucide="${group.icon}" class="edit-group-icon"></i>
                    <span class="edit-group-name">${group.name}</span>
                    <span class="edit-group-count">${group.items.length}</span>
                    <div class="edit-group-actions">
                        <button class="edit-group-btn rename-btn" data-group-id="${group.id}" title="Đổi tên">
                            <i data-lucide="pencil"></i>
                        </button>
                        <button class="edit-group-btn delete-btn" data-group-id="${group.id}" title="Xóa nhóm">
                            <i data-lucide="trash-2"></i>
                        </button>
                    </div>
                </div>
                <div class="edit-group-items" data-group-id="${group.id}">
                    ${group.items.map(pageId => {
                        const menuItem = MENU_CONFIG.find(m => m.pageIdentifier === pageId);
                        if (!menuItem) return '';
                        return `
                            <div class="edit-item" data-page-id="${pageId}">
                                <span class="edit-item-drag-handle"><i data-lucide="grip-vertical"></i></span>
                                <i data-lucide="${menuItem.icon}"></i>
                                <span>${menuItem.text}</span>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `).join('');

        // Build ungrouped items HTML - always show as drop target
        const ungroupedItems = layout.ungroupedItems || [];
        const ungroupedHtml = `
            <div class="edit-group edit-group-ungrouped" data-group-id="ungrouped">
                <div class="edit-group-header">
                    <i data-lucide="more-horizontal" class="edit-group-icon"></i>
                    <span class="edit-group-name">Chưa phân nhóm</span>
                    <span class="edit-group-count">${ungroupedItems.length}</span>
                </div>
                <div class="edit-group-items" data-group-id="ungrouped">
                    ${ungroupedItems.map(pageId => {
                        const menuItem = MENU_CONFIG.find(m => m.pageIdentifier === pageId);
                        if (!menuItem) return '';
                        return `
                            <div class="edit-item" data-page-id="${pageId}">
                                <span class="edit-item-drag-handle"><i data-lucide="grip-vertical"></i></span>
                                <i data-lucide="${menuItem.icon}"></i>
                                <span>${menuItem.text}</span>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;

        modal.innerHTML = `
            <div class="menu-edit-modal">
                <div class="menu-edit-header">
                    <h2><i data-lucide="layout-grid"></i> Chỉnh Sửa Menu Sidebar</h2>
                    <p>Kéo thả để sắp xếp nhóm và menu items</p>
                    <button class="menu-edit-close" id="closeMenuEditModal">
                        <i data-lucide="x"></i>
                    </button>
                </div>
                <div class="menu-edit-body">
                    <div class="menu-edit-groups" id="editGroupsContainer">
                        ${groupsHtml}
                        ${ungroupedHtml}
                    </div>
                    <button class="menu-edit-add-group" id="addNewGroupBtn">
                        <i data-lucide="plus"></i>
                        Thêm Nhóm Mới
                    </button>
                </div>
                <div class="menu-edit-footer">
                    <button class="btn-secondary" id="cancelMenuEdit">Hủy</button>
                    <button class="btn-primary" id="saveMenuEdit">
                        <i data-lucide="check"></i>
                        Lưu Thay Đổi
                    </button>
                </div>
            </div>
        `;

        // Inject modal styles
        this.injectMenuEditModalStyles();

        document.body.appendChild(modal);
        if (typeof lucide !== 'undefined') lucide.createIcons();

        // Initialize sortable
        this.initializeEditModalSortable();

        // Event listeners
        const closeModal = () => {
            this.destroyEditModalSortables();
            MenuLayoutStore.setEditing(false);
            modal.remove();
        };

        document.getElementById('closeMenuEditModal').addEventListener('click', closeModal);
        document.getElementById('cancelMenuEdit').addEventListener('click', closeModal);

        document.getElementById('saveMenuEdit').addEventListener('click', () => {
            // Layout is already being saved on each drag operation
            closeModal();
            this.renderDesktopSidebar();
        });

        document.getElementById('addNewGroupBtn').addEventListener('click', () => {
            this.showAddGroupModalInEdit();
        });

        // Rename/Delete buttons
        modal.querySelectorAll('.rename-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const groupId = btn.dataset.groupId;
                this.showRenameGroupModalInEdit(groupId);
            });
        });

        modal.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const groupId = btn.dataset.groupId;
                this.deleteGroupInEdit(groupId);
            });
        });
    },

    /**
     * Initialize SortableJS for edit modal
     */
    initializeEditModalSortable() {
        if (!window.Sortable) return;

        // Make groups sortable
        const groupsContainer = document.getElementById('editGroupsContainer');
        if (groupsContainer) {
            this.groupSortable = new Sortable(groupsContainer, {
                animation: 150,
                handle: '.edit-group-drag-handle',
                ghostClass: 'sortable-ghost',
                chosenClass: 'sortable-chosen',
                filter: '.edit-group-ungrouped',
                onEnd: (evt) => this.handleGroupReorderInEdit(evt)
            });
        }

        // Make items within each group sortable
        this.itemSortables = [];
        document.querySelectorAll('.edit-group-items').forEach(container => {
            const sortable = new Sortable(container, {
                group: 'edit-menu-items',
                animation: 150,
                handle: '.edit-item-drag-handle',
                ghostClass: 'sortable-ghost',
                chosenClass: 'sortable-chosen',
                onEnd: (evt) => this.handleItemMoveInEdit(evt)
            });
            this.itemSortables.push(sortable);
        });
    },

    /**
     * Destroy sortable instances
     */
    destroyEditModalSortables() {
        if (this.groupSortable) {
            this.groupSortable.destroy();
            this.groupSortable = null;
        }
        this.itemSortables.forEach(s => s.destroy());
        this.itemSortables = [];
    },

    /**
     * Handle group reorder in edit modal
     */
    handleGroupReorderInEdit(evt) {
        const layout = MenuLayoutStore.getLayout();
        const groups = [...layout.groups];
        const [moved] = groups.splice(evt.oldIndex, 1);
        groups.splice(evt.newIndex, 0, moved);
        MenuLayoutStore.saveLayout({ ...layout, groups });
    },

    /**
     * Handle item move in edit modal
     */
    handleItemMoveInEdit(evt) {
        const fromGroupId = evt.from.dataset.groupId;
        const toGroupId = evt.to.dataset.groupId;
        const pageId = evt.item.dataset.pageId;

        const layout = MenuLayoutStore.getLayout();

        // Remove from source
        if (fromGroupId === 'ungrouped') {
            layout.ungroupedItems = layout.ungroupedItems.filter(id => id !== pageId);
        } else {
            const fromGroup = layout.groups.find(g => g.id === fromGroupId);
            if (fromGroup) fromGroup.items = fromGroup.items.filter(id => id !== pageId);
        }

        // Add to target
        if (toGroupId === 'ungrouped') {
            layout.ungroupedItems = layout.ungroupedItems || [];
            layout.ungroupedItems.splice(evt.newIndex, 0, pageId);
        } else {
            const toGroup = layout.groups.find(g => g.id === toGroupId);
            if (toGroup) toGroup.items.splice(evt.newIndex, 0, pageId);
        }

        MenuLayoutStore.saveLayout(layout);

        // Update counts in modal
        this.updateGroupCountsInModal();
    },

    /**
     * Update group counts in edit modal
     */
    updateGroupCountsInModal() {
        const layout = MenuLayoutStore.getLayout();
        layout.groups.forEach(group => {
            const countEl = document.querySelector(`.edit-group[data-group-id="${group.id}"] .edit-group-count`);
            if (countEl) countEl.textContent = group.items.length;
        });
        const ungroupedCountEl = document.querySelector('.edit-group-ungrouped .edit-group-count');
        if (ungroupedCountEl) ungroupedCountEl.textContent = (layout.ungroupedItems || []).length;
    },

    /**
     * Show add group modal (inside edit modal)
     */
    showAddGroupModalInEdit() {
        const name = prompt('Nhập tên nhóm mới:');
        if (!name || !name.trim()) return;

        const layout = MenuLayoutStore.getLayout();
        const newGroup = {
            id: `group_${Date.now()}`,
            name: name.trim(),
            icon: 'folder',
            collapsed: false,
            items: []
        };
        layout.groups.push(newGroup);
        MenuLayoutStore.saveLayout(layout);

        // Refresh edit modal
        document.getElementById('menuEditModal')?.remove();
        this.showMenuEditModal();
    },

    /**
     * Show rename group modal (inside edit modal)
     */
    showRenameGroupModalInEdit(groupId) {
        const layout = MenuLayoutStore.getLayout();
        const group = layout.groups.find(g => g.id === groupId);
        if (!group) return;

        const newName = prompt('Nhập tên mới cho nhóm:', group.name);
        if (!newName || !newName.trim()) return;

        group.name = newName.trim();
        MenuLayoutStore.saveLayout(layout);

        // Update name in modal
        const nameEl = document.querySelector(`.edit-group[data-group-id="${groupId}"] .edit-group-name`);
        if (nameEl) nameEl.textContent = newName.trim();
    },

    /**
     * Delete group (inside edit modal)
     */
    deleteGroupInEdit(groupId) {
        if (!confirm('Xóa nhóm này? Các menu sẽ được chuyển sang "Chưa phân nhóm".')) return;

        const layout = MenuLayoutStore.getLayout();
        const groupIndex = layout.groups.findIndex(g => g.id === groupId);
        if (groupIndex === -1) return;

        const group = layout.groups[groupIndex];
        layout.ungroupedItems = layout.ungroupedItems || [];
        layout.ungroupedItems.push(...group.items);
        layout.groups.splice(groupIndex, 1);
        MenuLayoutStore.saveLayout(layout);

        // Refresh edit modal
        document.getElementById('menuEditModal')?.remove();
        this.showMenuEditModal();
    },

    /**
     * Inject CSS for menu edit modal
     */
    injectMenuEditModalStyles() {
        if (document.getElementById('menuEditModalStyles')) return;

        const style = document.createElement('style');
        style.id = 'menuEditModalStyles';
        style.textContent = `
            .menu-edit-modal-overlay {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0,0,0,0.8);
                z-index: 10000;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 20px;
            }
            .menu-edit-modal {
                background: #1e293b;
                border-radius: 16px;
                width: 100%;
                max-width: 600px;
                max-height: 90vh;
                display: flex;
                flex-direction: column;
                box-shadow: 0 20px 60px rgba(0,0,0,0.5);
            }
            .menu-edit-header {
                padding: 20px 24px;
                border-bottom: 1px solid rgba(255,255,255,0.1);
                position: relative;
            }
            .menu-edit-header h2 {
                margin: 0 0 4px 0;
                font-size: 18px;
                color: white;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .menu-edit-header p {
                margin: 0;
                font-size: 13px;
                color: rgba(255,255,255,0.5);
            }
            .menu-edit-close {
                position: absolute;
                top: 16px;
                right: 16px;
                background: none;
                border: none;
                color: rgba(255,255,255,0.5);
                cursor: pointer;
                padding: 8px;
                border-radius: 8px;
            }
            .menu-edit-close:hover {
                background: rgba(255,255,255,0.1);
                color: white;
            }
            .menu-edit-body {
                flex: 1;
                overflow-y: auto;
                padding: 16px 24px;
            }
            .menu-edit-groups {
                display: flex;
                flex-direction: column;
                gap: 12px;
            }
            .edit-group {
                background: rgba(255,255,255,0.05);
                border-radius: 12px;
                overflow: hidden;
            }
            .edit-group-header {
                display: flex;
                align-items: center;
                gap: 10px;
                padding: 12px 16px;
                background: rgba(255,255,255,0.05);
            }
            .edit-group-drag-handle {
                cursor: grab;
                color: rgba(255,255,255,0.3);
                display: flex;
                align-items: center;
            }
            .edit-group-drag-handle:hover {
                color: rgba(255,255,255,0.6);
            }
            .edit-group-icon {
                width: 18px;
                height: 18px;
                color: #a5b4fc;
            }
            .edit-group-name {
                flex: 1;
                font-weight: 600;
                color: white;
                font-size: 14px;
            }
            .edit-group-count {
                font-size: 12px;
                color: rgba(255,255,255,0.4);
                background: rgba(255,255,255,0.1);
                padding: 2px 8px;
                border-radius: 10px;
            }
            .edit-group-actions {
                display: flex;
                gap: 4px;
            }
            .edit-group-btn {
                padding: 6px;
                background: none;
                border: none;
                color: rgba(255,255,255,0.4);
                cursor: pointer;
                border-radius: 6px;
            }
            .edit-group-btn:hover {
                background: rgba(255,255,255,0.1);
                color: white;
            }
            .edit-group-btn.delete-btn:hover {
                color: #f87171;
            }
            .edit-group-items {
                padding: 8px;
                min-height: 40px;
            }
            .edit-item {
                display: flex;
                align-items: center;
                gap: 10px;
                padding: 10px 12px;
                background: rgba(255,255,255,0.03);
                border-radius: 8px;
                margin-bottom: 4px;
                color: rgba(255,255,255,0.8);
                font-size: 13px;
            }
            .edit-item:last-child {
                margin-bottom: 0;
            }
            .edit-item-drag-handle {
                cursor: grab;
                color: rgba(255,255,255,0.3);
                display: flex;
                align-items: center;
            }
            .edit-item-drag-handle:hover {
                color: rgba(255,255,255,0.6);
            }
            .edit-item i:not(.edit-item-drag-handle i) {
                width: 16px;
                height: 16px;
                color: rgba(255,255,255,0.5);
            }
            .menu-edit-add-group {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                width: 100%;
                padding: 14px;
                margin-top: 12px;
                background: rgba(34, 197, 94, 0.1);
                border: 2px dashed rgba(34, 197, 94, 0.3);
                border-radius: 12px;
                color: #86efac;
                cursor: pointer;
                font-size: 14px;
            }
            .menu-edit-add-group:hover {
                background: rgba(34, 197, 94, 0.15);
                border-color: rgba(34, 197, 94, 0.5);
            }
            .menu-edit-footer {
                padding: 16px 24px;
                border-top: 1px solid rgba(255,255,255,0.1);
                display: flex;
                justify-content: flex-end;
                gap: 12px;
            }
            .menu-edit-footer .btn-secondary {
                padding: 10px 20px;
                background: rgba(255,255,255,0.1);
                border: none;
                border-radius: 8px;
                color: white;
                cursor: pointer;
            }
            .menu-edit-footer .btn-secondary:hover {
                background: rgba(255,255,255,0.15);
            }
            .menu-edit-footer .btn-primary {
                padding: 10px 20px;
                background: #6366f1;
                border: none;
                border-radius: 8px;
                color: white;
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .menu-edit-footer .btn-primary:hover {
                background: #5558e3;
            }
            /* Sortable states */
            .sortable-ghost {
                opacity: 0.4;
            }
            .sortable-chosen {
                background: rgba(99, 102, 241, 0.2) !important;
            }
        `;
        document.head.appendChild(style);
    },

    // =====================================================
    // SIDEBAR TOGGLE (Desktop Only)
    // =====================================================

    initializeSidebarToggle() {
        const sidebar = document.getElementById("sidebar");
        const sidebarToggle = document.getElementById("sidebarToggle");

        if (!sidebar || !sidebarToggle) {
            console.warn("[Unified Nav] Sidebar toggle elements not found");
            return;
        }

        sidebarToggle.addEventListener("click", (e) => {
            e.stopPropagation();
            this.toggleSidebar();
        });

        this.createFixedToggleButton();
        this.restoreSidebarState();

        console.log("[Unified Nav] Sidebar toggle initialized");
    },

    toggleSidebar() {
        const sidebar = document.getElementById("sidebar");
        if (!sidebar) return;

        if (sidebar.classList.contains("collapsed")) {
            this.showSidebar();
        } else {
            this.hideSidebar();
        }
    },

    hideSidebar() {
        const sidebar = document.getElementById("sidebar");
        if (!sidebar) return;

        sidebar.classList.add("collapsed");
        localStorage.setItem("sidebarCollapsed", "true");

        const sidebarToggle = document.getElementById("sidebarToggle");
        const icon = sidebarToggle?.querySelector("i");
        if (icon) {
            icon.setAttribute("data-lucide", "panel-left-open");
            if (typeof lucide !== "undefined") {
                lucide.createIcons();
            }
        }

        console.log("[Unified Nav] Sidebar hidden");
    },

    showSidebar() {
        const sidebar = document.getElementById("sidebar");
        if (!sidebar) return;

        sidebar.classList.remove("collapsed");
        localStorage.setItem("sidebarCollapsed", "false");

        const sidebarToggle = document.getElementById("sidebarToggle");
        const icon = sidebarToggle?.querySelector("i");
        if (icon) {
            icon.setAttribute("data-lucide", "panel-left-close");
            if (typeof lucide !== "undefined") {
                lucide.createIcons();
            }
        }

        console.log("[Unified Nav] Sidebar shown");
    },

    createFixedToggleButton() {
        const mainContent = document.querySelector(".main-content");
        if (!mainContent) return;

        if (document.querySelector(".sidebar-toggle-fixed")) return;

        const fixedBtn = document.createElement("button");
        fixedBtn.className = "sidebar-toggle-fixed";
        fixedBtn.innerHTML = '<i data-lucide="panel-left-open"></i>';
        fixedBtn.title = "Mở sidebar";

        fixedBtn.addEventListener("click", () => {
            this.showSidebar();
        });

        mainContent.appendChild(fixedBtn);

        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }

        console.log("[Unified Nav] Fixed toggle button created");
    },

    restoreSidebarState() {
        const sidebar = document.getElementById("sidebar");
        const mainContent = document.querySelector(".main-content");

        if (!sidebar || !mainContent) return;

        if (window.innerWidth > 768) {
            const storedState = localStorage.getItem("sidebarCollapsed");
            const isCollapsed =
                storedState === null ? true : storedState === "true";

            if (storedState === null) {
                localStorage.setItem("sidebarCollapsed", "true");
            }

            if (isCollapsed) {
                sidebar.classList.add("collapsed");
                mainContent.classList.add("expanded");

                const sidebarToggle = document.getElementById("sidebarToggle");
                const icon = sidebarToggle?.querySelector("i");
                if (icon) {
                    icon.setAttribute("data-lucide", "panel-left-open");
                    if (typeof lucide !== "undefined") {
                        lucide.createIcons();
                    }
                }

                console.log("[Unified Nav] Sidebar state restored: collapsed");
            }
        }
    }
};

console.log('[Navigation] Sidebar module loaded');
