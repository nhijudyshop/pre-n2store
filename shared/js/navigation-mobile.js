/* =====================================================
   NAVIGATION MOBILE - Mobile-specific navigation (hamburger, touch, responsive)
   Sub-module of navigation-modern.js
   Load order: 4 (after config, permissions, sidebar)
   Dependencies: navigation-config.js (MENU_CONFIG, MenuLayoutStore, ShopConfig)
   ===================================================== */

// =====================================================
// UnifiedNavigationManager - Mobile methods
// Attached as mixin to the class defined in navigation-core.js
// =====================================================

window._navigationMobileMixin = {

    // =====================================================
    // MOBILE NAVIGATION
    // =====================================================

    renderMobileNavigation() {
        console.log("[Unified Nav] Rendering mobile UI...");

        this.injectMobileStyles();

        const sidebar = document.getElementById("sidebar");
        if (sidebar) {
            sidebar.style.display = "none";
            console.log("[Unified Nav] Desktop sidebar hidden");
        }

        const existingTopBar = document.querySelector(".mobile-top-bar");
        const existingBottomNav = document.querySelector(".mobile-bottom-nav");
        if (existingTopBar) existingTopBar.remove();
        if (existingBottomNav) existingBottomNav.remove();

        this.createMobileTopBar();
        this.createMobileBottomNav();

        const mainContent = document.querySelector(".main-content");
        if (mainContent) {
            mainContent.style.paddingTop = "60px";
            mainContent.style.paddingBottom = "70px";
            mainContent.style.position = "relative";
            console.log("[Unified Nav] Main content padding adjusted");
        }

        document.body.style.paddingTop = "60px";
        document.body.style.paddingBottom = "65px";

        const bottomNavCheck = document.querySelector(".mobile-bottom-nav");
        if (bottomNavCheck) {
            console.log("[Unified Nav] Mobile bottom nav exists in DOM");
        } else {
            console.error(
                "[Unified Nav] Mobile bottom nav NOT found in DOM!",
            );
        }
    },

    createMobileTopBar() {
        const existingBar = document.querySelector(".mobile-top-bar");
        if (existingBar) existingBar.remove();

        const topBar = document.createElement("div");
        topBar.className = "mobile-top-bar";

        const userInfo = window.authManager?.getUserInfo();
        const roleMap = { 0: "Admin", 1: "Manager", 3: "Staff", 777: "Guest" };
        const checkLogin = localStorage.getItem("checkLogin");
        const roleName = roleMap[checkLogin] || "User";

        topBar.innerHTML = `
            <div class="mobile-top-content">
                <div class="mobile-user-info">
                    <div class="mobile-user-avatar">
                        <i data-lucide="user"></i>
                    </div>
                    <div class="mobile-user-details">
                        <div class="mobile-user-name-wrapper">
                            <div class="mobile-user-name">${userInfo?.displayName || "User"}</div>
                            <button class="edit-displayname-btn" id="editDisplayNameMobile" title="Chỉnh sửa tên hiển thị">
                                <i data-lucide="edit-2"></i>
                            </button>
                        </div>
                        <div class="mobile-user-role">${roleName}</div>
                    </div>
                </div>
                <select class="shop-selector mobile-shop-selector" id="mobileShopSelector">
                    ${window.ShopConfig.getShops().map(s =>
                        `<option value="${s.id}"${s.id === window.ShopConfig.getSelectedShopId() ? ' selected' : ''}>${s.label}</option>`
                    ).join('')}
                </select>
                <button class="mobile-menu-btn" id="mobileMenuBtn">
                    <i data-lucide="menu"></i>
                </button>
            </div>
        `;

        document.body.insertBefore(topBar, document.body.firstChild);

        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }

        // Add event listener for edit button
        const editBtn = topBar.querySelector("#editDisplayNameMobile");
        if (editBtn) {
            editBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                this.showEditDisplayNameModal();
            });
        }

        // Mobile shop selector
        const mobileShopSelector = topBar.querySelector('#mobileShopSelector');
        if (mobileShopSelector) {
            mobileShopSelector.addEventListener('change', (e) => {
                window.ShopConfig.setShop(e.target.value);
                if (!window._shopChangeNoReload) {
                    window.location.reload();
                }
            });
        }

        // Inject mobile shop selector styles
        this.injectShopSelectorStyles();
    },

    createMobileBottomNav() {
        const existingNav = document.querySelector(".mobile-bottom-nav");
        if (existingNav) existingNav.remove();

        const bottomNav = document.createElement("div");
        bottomNav.className = "mobile-bottom-nav";

        const accessiblePages = this.getAccessiblePages();

        console.log(
            "[Mobile Nav] Total accessible pages:",
            accessiblePages.length,
        );
        console.log("[Mobile Nav] Current page identifier:", this.currentPage);

        const bottomNavPages = accessiblePages.slice(0, 5);

        console.log(
            "[Mobile Nav] Bottom nav pages:",
            bottomNavPages.map((p) => p.pageIdentifier),
        );

        bottomNavPages.forEach((item) => {
            const navItem = document.createElement("a");
            navItem.href = item.href;
            navItem.className = "mobile-nav-item";

            if (item.pageIdentifier === this.currentPage) {
                navItem.classList.add("active");
                console.log("[Mobile Nav] Active page:", item.pageIdentifier);
            }

            navItem.innerHTML = `
                <i data-lucide="${item.icon}"></i>
                <span>${item.shortText || item.text}</span>
            `;

            bottomNav.appendChild(navItem);
        });

        if (accessiblePages.length > 5) {
            const moreBtn = document.createElement("button");
            moreBtn.className = "mobile-nav-item mobile-more-btn";
            moreBtn.innerHTML = `
                <i data-lucide="more-horizontal"></i>
                <span>Thêm</span>
            `;
            moreBtn.addEventListener("click", (e) => {
                e.preventDefault();
                this.showMobileMenu();
            });
            bottomNav.appendChild(moreBtn);
        }

        document.body.appendChild(bottomNav);

        console.log(
            "[Mobile Nav] Bottom nav created with",
            bottomNav.children.length,
            "items",
        );

        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }
    },

    showMobileMenu() {
        const overlay = document.createElement("div");
        overlay.className = "mobile-menu-overlay";

        const menu = document.createElement("div");
        menu.className = "mobile-menu-panel";

        // Get filtered layout based on user permissions
        const filteredLayout = MenuLayoutStore.getFilteredLayout(this.userPermissions);

        // Inject mobile group styles
        this.injectMobileGroupStyles();

        // Build grouped menu HTML
        let menuContentHtml = '';

        filteredLayout.groups.forEach((group) => {
            const hasActivePage = group.items.some(item => item.pageIdentifier === this.currentPage);
            const isCollapsed = !hasActivePage;
            menuContentHtml += `
                <div class="mobile-menu-group ${isCollapsed ? 'collapsed' : ''}" data-group-id="${group.id}">
                    <div class="mobile-group-header">
                        <span class="mobile-group-collapse-icon"><i data-lucide="chevron-down"></i></span>
                        <i data-lucide="${group.icon}" class="mobile-group-icon"></i>
                        <span class="mobile-group-name">${group.name}</span>
                        <span class="mobile-group-count">${group.items.length}</span>
                    </div>
                    <div class="mobile-group-items">
                        ${group.items.map(item => `
                            <a href="${item.href}" class="mobile-menu-item ${item.pageIdentifier === this.currentPage ? 'active' : ''}">
                                <i data-lucide="${item.icon}"></i>
                                <span>${item.text}</span>
                                ${item.pageIdentifier === this.currentPage ? '<i data-lucide="check" class="check-icon"></i>' : ''}
                            </a>
                        `).join('')}
                    </div>
                </div>
            `;
        });

        // Add ungrouped items if any
        if (filteredLayout.ungroupedItems && filteredLayout.ungroupedItems.length > 0) {
            const hasActivePage = filteredLayout.ungroupedItems.some(item => item.pageIdentifier === this.currentPage);
            const isCollapsed = !hasActivePage;
            menuContentHtml += `
                <div class="mobile-menu-group ${isCollapsed ? 'collapsed' : ''}" data-group-id="ungrouped">
                    <div class="mobile-group-header">
                        <span class="mobile-group-collapse-icon"><i data-lucide="chevron-down"></i></span>
                        <i data-lucide="more-horizontal" class="mobile-group-icon"></i>
                        <span class="mobile-group-name">Khác</span>
                        <span class="mobile-group-count">${filteredLayout.ungroupedItems.length}</span>
                    </div>
                    <div class="mobile-group-items">
                        ${filteredLayout.ungroupedItems.map(item => `
                            <a href="${item.href}" class="mobile-menu-item ${item.pageIdentifier === this.currentPage ? 'active' : ''}">
                                <i data-lucide="${item.icon}"></i>
                                <span>${item.text}</span>
                                ${item.pageIdentifier === this.currentPage ? '<i data-lucide="check" class="check-icon"></i>' : ''}
                            </a>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        menu.innerHTML = `
            <div class="mobile-menu-header">
                <h3>Tất Cả Trang</h3>
                <button class="mobile-menu-close" id="closeMobileMenu">
                    <i data-lucide="x"></i>
                </button>
            </div>
            <div class="mobile-menu-content">
                ${menuContentHtml}
            </div>
            <div class="mobile-menu-footer">
                <button class="mobile-menu-action" id="mobileSettingsBtn">
                    <i data-lucide="settings"></i>
                    <span>Cài Đặt</span>
                </button>
                <button class="mobile-menu-action" id="mobileLogoutBtn">
                    <i data-lucide="log-out"></i>
                    <span>Đăng Xuất</span>
                </button>
            </div>
        `;

        overlay.appendChild(menu);
        document.body.appendChild(overlay);

        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }

        const closeBtn = menu.querySelector("#closeMobileMenu");
        closeBtn.addEventListener("click", () => overlay.remove());
        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) overlay.remove();
        });

        // Mobile group collapse/expand handlers
        menu.querySelectorAll('.mobile-group-header').forEach(header => {
            header.addEventListener('click', (e) => {
                const groupEl = header.closest('.mobile-menu-group');
                const groupId = groupEl.dataset.groupId;
                const isCollapsed = groupEl.classList.toggle('collapsed');
                this.saveMobileGroupCollapsedState(groupId, isCollapsed);
            });
        });

        const settingsBtn = menu.querySelector("#mobileSettingsBtn");
        settingsBtn.addEventListener("click", () => {
            overlay.remove();
            this.showSettings();
        });

        const logoutBtn = menu.querySelector("#mobileLogoutBtn");
        logoutBtn.addEventListener("click", () => {
            overlay.remove();
            this.showLogoutConfirmDialog();
        });
    },

    /**
     * Get mobile group collapsed state from localStorage
     */
    getMobileGroupCollapsedState() {
        try {
            const state = localStorage.getItem('n2shop_mobile_group_collapsed');
            return state ? JSON.parse(state) : {};
        } catch (e) {
            return {};
        }
    },

    /**
     * Save mobile group collapsed state to localStorage
     */
    saveMobileGroupCollapsedState(groupId, isCollapsed) {
        try {
            const state = this.getMobileGroupCollapsedState();
            state[groupId] = isCollapsed;
            localStorage.setItem('n2shop_mobile_group_collapsed', JSON.stringify(state));
        } catch (e) {
            console.error('[Mobile Menu] Error saving collapsed state:', e);
        }
    },

    /**
     * Inject CSS styles for mobile grouped menu
     */
    injectMobileGroupStyles() {
        if (document.getElementById('mobileGroupStyles')) return;

        const style = document.createElement('style');
        style.id = 'mobileGroupStyles';
        style.textContent = `
            /* Mobile Menu Groups */
            .mobile-menu-group {
                margin-bottom: 8px;
            }
            .mobile-group-header {
                display: flex;
                align-items: center;
                gap: 10px;
                padding: 12px 16px;
                background: rgba(255,255,255,0.05);
                border-radius: 8px;
                cursor: pointer;
                user-select: none;
            }
            .mobile-group-header:active {
                background: rgba(255,255,255,0.1);
            }
            .mobile-group-collapse-icon {
                width: 18px;
                height: 18px;
                display: flex;
                align-items: center;
                justify-content: center;
                color: rgba(255,255,255,0.5);
                transition: transform 0.2s ease;
            }
            .mobile-menu-group.collapsed .mobile-group-collapse-icon {
                transform: rotate(-90deg);
            }
            .mobile-group-collapse-icon i,
            .mobile-group-collapse-icon svg {
                width: 16px;
                height: 16px;
                stroke-width: 2.5;
            }
            .mobile-group-icon {
                width: 18px;
                height: 18px;
                color: #a5b4fc;
            }
            .mobile-group-name {
                flex: 1;
                font-size: 13px;
                font-weight: 600;
                color: rgba(255,255,255,0.9);
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            .mobile-group-count {
                font-size: 11px;
                color: rgba(255,255,255,0.4);
                background: rgba(255,255,255,0.1);
                padding: 2px 8px;
                border-radius: 10px;
            }
            .mobile-group-items {
                padding-left: 16px;
                margin-top: 4px;
            }
            .mobile-menu-group.collapsed .mobile-group-items {
                display: none;
            }
            .mobile-group-items .mobile-menu-item {
                padding-left: 32px;
            }
        `;
        document.head.appendChild(style);
    },

    // =====================================================
    // MOBILE STYLES
    // =====================================================

    injectMobileStyles() {
        if (document.getElementById("mobileNavStyles")) return;

        const style = document.createElement("style");
        style.id = "mobileNavStyles";
        style.textContent = `
            .mobile-top-bar {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                height: 60px;
                background: linear-gradient(135deg, #6366f1, #4f46e5);
                box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
                z-index: 1000;
            }

            .mobile-top-content {
                display: flex;
                align-items: center;
                justify-content: space-between;
                height: 100%;
                padding: 0 16px;
            }

            .mobile-user-info {
                display: flex;
                align-items: center;
                gap: 12px;
            }

            .mobile-user-avatar {
                width: 40px;
                height: 40px;
                border-radius: 50%;
                background: rgba(255, 255, 255, 0.2);
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .mobile-user-avatar i {
                width: 20px;
                height: 20px;
                color: white;
            }

            .mobile-user-details {
                display: flex;
                flex-direction: column;
                gap: 2px;
            }

            .mobile-user-name {
                color: white;
                font-weight: 600;
                font-size: 14px;
            }

            .mobile-user-role {
                color: rgba(255, 255, 255, 0.8);
                font-size: 12px;
            }

            .mobile-menu-btn {
                width: 40px;
                height: 40px;
                border: none;
                background: rgba(255, 255, 255, 0.2);
                border-radius: 8px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                transition: all 0.2s;
            }

            .mobile-menu-btn:active {
                transform: scale(0.95);
                background: rgba(255, 255, 255, 0.3);
            }

            .mobile-menu-btn i {
                width: 24px;
                height: 24px;
                color: white;
            }

            .mobile-bottom-nav {
                position: fixed;
                bottom: 0;
                left: 0;
                right: 0;
                height: 65px;
                background: white;
                box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.1);
                display: flex !important;
                align-items: center;
                justify-content: space-around;
                padding: 8px 4px;
                z-index: 1000;
                visibility: visible !important;
                opacity: 1 !important;
            }

            .mobile-nav-item {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                gap: 4px;
                padding: 8px 12px;
                border-radius: 12px;
                text-decoration: none;
                color: #6b7280;
                transition: all 0.2s;
                flex: 1;
                max-width: 80px;
                background: none;
                border: none;
                cursor: pointer;
            }

            .mobile-nav-item i {
                width: 24px;
                height: 24px;
                transition: all 0.2s;
            }

            .mobile-nav-item span {
                font-size: 11px;
                font-weight: 500;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                max-width: 100%;
            }

            .mobile-nav-item.active {
                color: #6366f1;
                background: rgba(99, 102, 241, 0.1);
            }

            .mobile-nav-item.active i {
                transform: scale(1.1);
            }

            .mobile-nav-item:active {
                transform: scale(0.95);
            }

            .mobile-menu-overlay {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.5);
                z-index: 2000;
                display: flex;
                align-items: flex-end;
                animation: fadeIn 0.3s;
            }

            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }

            .mobile-menu-panel {
                width: 100%;
                max-height: 80vh;
                background: white;
                border-radius: 20px 20px 0 0;
                display: flex;
                flex-direction: column;
                animation: slideUp 0.3s;
            }

            @keyframes slideUp {
                from { transform: translateY(100%); }
                to { transform: translateY(0); }
            }

            .mobile-menu-header {
                padding: 20px;
                border-bottom: 1px solid #e5e7eb;
                display: flex;
                align-items: center;
                justify-content: space-between;
            }

            .mobile-menu-header h3 {
                margin: 0;
                font-size: 18px;
                font-weight: 600;
                color: #111827;
            }

            .mobile-menu-close {
                width: 36px;
                height: 36px;
                border: none;
                background: #f3f4f6;
                border-radius: 8px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
            }

            .mobile-menu-close i {
                width: 20px;
                height: 20px;
                color: #6b7280;
            }

            .mobile-menu-content {
                flex: 1;
                overflow-y: auto;
                padding: 12px;
            }

            .mobile-menu-item {
                display: flex;
                align-items: center;
                gap: 16px;
                padding: 16px;
                border-radius: 12px;
                text-decoration: none;
                color: #374151;
                margin-bottom: 4px;
                transition: all 0.2s;
                position: relative;
            }

            .mobile-menu-item:active {
                background: #f3f4f6;
                transform: scale(0.98);
            }

            .mobile-menu-item.active {
                background: rgba(99, 102, 241, 0.1);
                color: #6366f1;
                font-weight: 600;
            }

            .mobile-menu-item i {
                width: 24px;
                height: 24px;
                flex-shrink: 0;
            }

            .mobile-menu-item .check-icon {
                margin-left: auto;
                color: #10b981;
            }

            .mobile-menu-footer {
                padding: 16px;
                border-top: 1px solid #e5e7eb;
                display: flex;
                gap: 12px;
            }

            .mobile-menu-action {
                flex: 1;
                padding: 14px;
                border: none;
                border-radius: 12px;
                background: #f3f4f6;
                color: #374151;
                font-weight: 600;
                font-size: 14px;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                cursor: pointer;
                transition: all 0.2s;
            }

            .mobile-menu-action:active {
                transform: scale(0.95);
                background: #e5e7eb;
            }

            .mobile-menu-action i {
                width: 20px;
                height: 20px;
            }

            @media (max-width: 768px) {
                body {
                    padding-top: 60px;
                    padding-bottom: 65px;
                }
            }
        `;
        document.head.appendChild(style);
    }
};

console.log('[Navigation] Mobile module loaded');
