/* =====================================================
   NAVIGATION CORE - Class definition, initialization, shared functionality
   Sub-module of navigation-modern.js
   Load order: 5 (last - after config, permissions, sidebar, mobile)
   Dependencies: All other navigation-*.js modules
   ===================================================== */

class UnifiedNavigationManager {
    constructor() {
        this.currentPage = null;
        this.userPermissions = [];
        this.isAdminTemplate = false; // Admin flag: used for bypass in permission checks
        this.isMobile = window.innerWidth <= 768;
        this.isEditMode = false; // Menu edit mode (admin only)
        this.groupSortable = null; // SortableJS instance for groups
        this.itemSortables = []; // SortableJS instances for items
        this.init();
    }

    async init() {
        console.log("[Unified Nav] Starting initialization...");

        // Check authentication - use window.authManager explicitly
        const auth = window.authManager;
        const authData = auth ? auth.getAuthData() : null;
        console.log("[Unified Nav] Auth check - authManager exists:", !!auth, "| authData:", authData);

        if (!auth || !auth.isAuthenticated()) {
            console.log("[Unified Nav] User not authenticated, redirecting...");
            selectiveLogoutStorage();
            sessionStorage.clear();
            window.location.href = "../index.html";
            return;
        }

        try {
            // Get user info and determine admin status
            // IMPORTANT: Check both localStorage AND sessionStorage (depends on "remember me" setting)
            const authDataStr = localStorage.getItem("loginindex_auth") || sessionStorage.getItem("loginindex_auth") || "{}";
            const authData = JSON.parse(authDataStr);
            // isAdminTemplate: used for admin bypass in permission checks and UI display
            // Check isAdmin flag, roleTemplate, and legacy userType
            const userType = localStorage.getItem("userType") || "";
            this.isAdminTemplate = authData.isAdmin === true || authData.roleTemplate === 'admin' || userType.startsWith("admin");
            console.log("[Unified Nav] isAdmin:", this.isAdminTemplate, "| roleTemplate:", authData.roleTemplate);

            // Load permissions
            await this.loadUserPermissions();
            console.log(
                "[Unified Nav] Permissions loaded:",
                this.userPermissions,
            );

            // Get current page
            this.currentPage = this.getCurrentPageIdentifier();
            console.log("[Unified Nav] Current page:", this.currentPage);

            // Check page access
            const hasAccess = this.checkPageAccess();
            console.log("[Unified Nav] Has access to page:", hasAccess);

            if (!hasAccess) {
                this.showAccessDenied();
                return;
            }

            // Detect device type
            this.detectDevice();

            // Load custom menu names from Firebase before rendering
            await loadCustomMenuNamesFromFirebase();

            // Initialize menu layout store (for grouped menus)
            await MenuLayoutStore.init();

            // Build UI based on device
            this.renderNavigation();
            this.updateUserInfo();
            this.setupEventListeners();
            this.loadSettings();

            // Handle resize
            window.addEventListener("resize", () => this.handleResize());

            console.log("[Unified Nav] Initialization complete!");
        } catch (error) {
            console.error("[Unified Nav] Initialization error:", error);
        }
    }

    detectDevice() {
        this.isMobile = window.innerWidth <= 768;
        console.log(
            "[Unified Nav] Device type:",
            this.isMobile ? "Mobile" : "Desktop",
        );
    }

    handleResize() {
        const wasMobile = this.isMobile;
        this.detectDevice();

        // Rebuild UI if device type changed
        if (wasMobile !== this.isMobile) {
            console.log("[Unified Nav] Device type changed, rebuilding UI...");
            this.renderNavigation();
            this.setupEventListeners();
            if (typeof lucide !== "undefined") {
                lucide.createIcons();
            }
        } else if (!this.isMobile) {
            // On desktop, handle sidebar state during resize
            this.restoreSidebarState();
        }
    }

    // =====================================================
    // UNIFIED NAVIGATION RENDERING
    // =====================================================

    renderNavigation() {
        console.log("[Unified Nav] Rendering navigation...");

        if (this.isMobile) {
            this.renderMobileNavigation();
        } else {
            this.renderDesktopNavigation();
        }
    }

    // =====================================================
    // SHARED FUNCTIONALITY
    // =====================================================

    updateUserInfo() {
        const userInfo = window.authManager?.getUserInfo();
        if (!userInfo) return;

        const userName = document.getElementById("userName");
        if (userName) {
            // Check if edit button already exists
            const existingEditBtn = userName.parentElement.querySelector('.edit-displayname-btn');
            if (!existingEditBtn) {
                // Create wrapper for name + edit button
                const nameWrapper = document.createElement('div');
                nameWrapper.style.display = 'flex';
                nameWrapper.style.alignItems = 'center';
                nameWrapper.style.gap = '8px';

                // Create name span
                const nameSpan = document.createElement('span');
                nameSpan.id = 'userName';
                nameSpan.textContent = userInfo.displayName || "User";

                // Create edit button
                const editBtn = document.createElement('button');
                editBtn.className = 'edit-displayname-btn';
                editBtn.id = 'editDisplayNameDesktop';
                editBtn.title = 'Chỉnh sửa tên hiển thị';
                editBtn.innerHTML = '<i data-lucide="pencil"></i>';
                editBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.showEditDisplayNameModal();
                });

                // Replace userName with wrapper
                userName.replaceWith(nameWrapper);
                nameWrapper.appendChild(nameSpan);
                nameWrapper.appendChild(editBtn);

                if (typeof lucide !== "undefined") {
                    lucide.createIcons();
                }
            } else {
                userName.textContent = userInfo.displayName || "User";
            }
        }

        const userRole = document.querySelector(".user-role");
        if (userRole) {
            const roleMap = {
                0: "Admin",
                1: "Manager",
                3: "Staff",
                777: "Guest",
            };
            const checkLogin = localStorage.getItem("checkLogin");
            userRole.textContent = roleMap[checkLogin] || "User";
        }

        console.log("[Unified Nav] User info updated");
    }

    setupEventListeners() {
        const mobileMenuBtn = document.getElementById("mobileMenuBtn");
        if (mobileMenuBtn) {
            mobileMenuBtn.addEventListener("click", () =>
                this.showMobileMenu(),
            );
        }

        const menuToggle = document.getElementById("menuToggle");
        const sidebar = document.getElementById("sidebar");

        if (menuToggle && sidebar && !this.isMobile) {
            menuToggle.addEventListener("click", () => {
                sidebar.classList.toggle("active");
            });
        }

        document.addEventListener("click", (e) => {
            if (window.innerWidth <= 768 && sidebar) {
                if (
                    !sidebar.contains(e.target) &&
                    menuToggle &&
                    !menuToggle.contains(e.target) &&
                    sidebar.classList.contains("active")
                ) {
                    sidebar.classList.remove("active");
                }
            }
        });

        const btnLogout = document.getElementById("btnLogout");
        if (btnLogout) {
            btnLogout.addEventListener("click", () => {
                this.showLogoutConfirmDialog();
            });
        }

        const btnPermissions = document.getElementById("btnPermissions");
        if (btnPermissions) {
            btnPermissions.addEventListener("click", () => {
                this.showPermissionsSummary();
            });
        }

        const btnSettings = document.getElementById("btnSettings");
        if (btnSettings) {
            btnSettings.addEventListener("click", () => {
                this.showSettings();
            });
        }

        console.log("[Unified Nav] Event listeners setup complete");
    }

    // =====================================================
    // EDIT DISPLAY NAME FUNCTIONALITY
    // =====================================================

    showEditDisplayNameModal() {
        const userInfo = window.authManager?.getUserInfo();
        const currentDisplayName = userInfo?.displayName || "";

        // For mobile: show modal
        if (this.isMobile) {
            const modal = document.createElement("div");
            modal.className = "settings-modal-overlay";
            modal.innerHTML = `
                <div class="settings-modal" style="max-width: 450px;">
                    <div class="settings-header">
                        <h2>
                            <i data-lucide="edit-2"></i>
                            Chỉnh Sửa Tên Hiển Thị
                        </h2>
                        <button class="settings-close" id="closeEditModal">
                            <i data-lucide="x"></i>
                        </button>
                    </div>

                    <div class="settings-content">
                        <div class="setting-group">
                            <label class="setting-label">
                                <i data-lucide="user"></i>
                                Tên hiển thị hiện tại
                            </label>
                            <div style="padding: 12px; background: rgba(99, 102, 241, 0.1); border-radius: 8px; color: #6366f1; font-weight: 600; margin-bottom: 16px;">
                                ${currentDisplayName}
                            </div>

                            <label class="setting-label" style="margin-top: 16px;">
                                <i data-lucide="edit"></i>
                                Tên hiển thị mới
                            </label>
                            <input
                                type="text"
                                id="newDisplayNameInput"
                                class="displayname-input"
                                placeholder="Nhập tên... (hỗ trợ emoji)"
                                value="${currentDisplayName}"
                                maxlength="100"
                            >
                            <div class="emoji-picker" style="margin-top: 12px;">
                                <button type="button" class="emoji-btn" data-emoji="😊">😊</button>
                                <button type="button" class="emoji-btn" data-emoji="🎉">🎉</button>
                                <button type="button" class="emoji-btn" data-emoji="💖">💖</button>
                                <button type="button" class="emoji-btn" data-emoji="⭐">⭐</button>
                                <button type="button" class="emoji-btn" data-emoji="🔥">🔥</button>
                                <button type="button" class="emoji-btn" data-emoji="✨">✨</button>
                                <button type="button" class="emoji-btn" data-emoji="🌸">🌸</button>
                                <button type="button" class="emoji-btn" data-emoji="🎨">🎨</button>
                                <button type="button" class="emoji-btn" data-emoji="💫">💫</button>
                                <button type="button" class="emoji-btn" data-emoji="🎯">🎯</button>
                            </div>
                        </div>
                    </div>

                    <div class="settings-footer">
                        <button class="btn-reset" id="cancelEditBtn">
                            <i data-lucide="x"></i>
                            Hủy
                        </button>
                        <button class="btn-save" id="saveDisplayNameBtn">
                            <i data-lucide="check"></i>
                            Lưu
                        </button>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);

            if (typeof lucide !== "undefined") {
                lucide.createIcons();
            }

            const input = modal.querySelector("#newDisplayNameInput");
            const closeBtn = modal.querySelector("#closeEditModal");
            const cancelBtn = modal.querySelector("#cancelEditBtn");
            const saveBtn = modal.querySelector("#saveDisplayNameBtn");
            const emojiButtons = modal.querySelectorAll('.emoji-btn');

            // Add emoji button listeners
            emojiButtons.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    const emoji = btn.getAttribute('data-emoji');
                    const cursorPos = input.selectionStart;
                    const textBefore = input.value.substring(0, cursorPos);
                    const textAfter = input.value.substring(input.selectionEnd);
                    input.value = textBefore + emoji + textAfter;
                    input.focus();
                    input.selectionStart = input.selectionEnd = cursorPos + emoji.length;
                });
            });

            const closeModal = () => modal.remove();

            closeBtn.addEventListener("click", closeModal);
            cancelBtn.addEventListener("click", closeModal);
            modal.addEventListener("click", (e) => {
                if (e.target === modal) closeModal();
            });

            saveBtn.addEventListener("click", async () => {
                const newDisplayName = input.value.trim();

                if (!newDisplayName) {
                    this.showToast("Vui lòng nhập tên hiển thị!", "error");
                    input.focus();
                    return;
                }

                if (newDisplayName === currentDisplayName) {
                    this.showToast("Tên hiển thị không thay đổi!", "error");
                    return;
                }

                if (newDisplayName.length < 2) {
                    this.showToast("Tên hiển thị phải có ít nhất 2 ký tự!", "error");
                    input.focus();
                    return;
                }

                saveBtn.disabled = true;
                saveBtn.innerHTML = '<i data-lucide="loader"></i> Đang lưu...';
                if (typeof lucide !== "undefined") {
                    lucide.createIcons();
                }

                const success = await this.updateDisplayName(newDisplayName);

                if (success) {
                    closeModal();
                    this.showToast("Đã cập nhật tên hiển thị thành công!", "success");
                    this.refreshUserInfo();
                } else {
                    saveBtn.disabled = false;
                    saveBtn.innerHTML = '<i data-lucide="check"></i> Lưu';
                    if (typeof lucide !== "undefined") {
                        lucide.createIcons();
                    }
                }
            });

            input.focus();
            input.select();
        } else {
            // For desktop: inline editing on sidebar
            this.showInlineEditDisplayName();
        }

        // Add styles for input
        if (!document.getElementById("editDisplayNameStyles")) {
            const style = document.createElement("style");
            style.id = "editDisplayNameStyles";
            style.textContent = `
                .displayname-input {
                    width: 100%;
                    padding: 8px 12px;
                    border: 1px solid rgba(255, 255, 255, 0.3);
                    border-radius: 6px;
                    font-size: 13px;
                    font-weight: 500;
                    color: white;
                    background: rgba(255, 255, 255, 0.1);
                    transition: all 0.2s;
                    outline: none;
                    box-sizing: border-box;
                }

                .displayname-input:focus {
                    border-color: #00bcd4;
                    background: rgba(255, 255, 255, 0.15);
                    box-shadow: 0 0 0 2px rgba(0, 188, 212, 0.2);
                }

                .edit-displayname-btn {
                    background: transparent;
                    border: none;
                    padding: 2px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 3px;
                    transition: all 0.2s;
                    color: #00bcd4;
                    flex-shrink: 0;
                }

                .edit-displayname-btn:hover {
                    background: rgba(0, 188, 212, 0.15);
                    transform: scale(1.1);
                }

                .edit-displayname-btn i {
                    width: 12px;
                    height: 12px;
                }

                .mobile-user-name-wrapper {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }

                /* Emoji picker */
                .emoji-picker {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 4px;
                    padding: 8px;
                    background: rgba(255, 255, 255, 0.05);
                    border-radius: 6px;
                    border: 1px dashed rgba(255, 255, 255, 0.2);
                }

                .emoji-btn {
                    background: rgba(255, 255, 255, 0.1);
                    border: none;
                    padding: 6px 8px;
                    border-radius: 4px;
                    font-size: 18px;
                    cursor: pointer;
                    transition: all 0.2s;
                    line-height: 1;
                }

                .emoji-btn:hover {
                    background: rgba(0, 188, 212, 0.3);
                    transform: scale(1.15);
                }

                .emoji-btn:active {
                    transform: scale(0.95);
                }

                /* Inline edit form on sidebar */
                .displayname-edit-form {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                    padding: 8px;
                    background: rgba(0, 0, 0, 0.2);
                    border-radius: 6px;
                    margin-top: 4px;
                }

                .displayname-edit-actions {
                    display: flex;
                    gap: 6px;
                }

                .displayname-edit-actions button {
                    flex: 1;
                    padding: 6px 12px;
                    border: none;
                    border-radius: 4px;
                    font-size: 12px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 4px;
                }

                .displayname-edit-actions button i {
                    width: 14px;
                    height: 14px;
                }

                .btn-save-inline {
                    background: #00bcd4;
                    color: white;
                }

                .btn-save-inline:hover {
                    background: #00a5bb;
                    transform: translateY(-1px);
                    box-shadow: 0 2px 4px rgba(0, 188, 212, 0.3);
                }

                .btn-cancel-inline {
                    background: rgba(255, 255, 255, 0.1);
                    color: rgba(255, 255, 255, 0.8);
                }

                .btn-cancel-inline:hover {
                    background: rgba(255, 255, 255, 0.2);
                    color: white;
                }

                /* Desktop sidebar edit button */
                #sidebar .edit-displayname-btn {
                    color: #00bcd4;
                }

                #sidebar .edit-displayname-btn:hover {
                    background: rgba(0, 188, 212, 0.15);
                    color: #00e5ff;
                }
            `;
            document.head.appendChild(style);
        }
    }

    showInlineEditDisplayName() {
        const userInfo = window.authManager?.getUserInfo();
        const currentDisplayName = userInfo?.displayName || "";

        // Find the user info container
        const userInfoContainer = document.querySelector('.user-info');
        if (!userInfoContainer) return;

        // Check if already editing
        if (userInfoContainer.querySelector('.displayname-edit-form')) {
            return;
        }

        // Hide the userName display and edit button
        const userName = document.getElementById("userName");
        const editBtn = document.getElementById("editDisplayNameDesktop");
        if (userName) userName.style.display = 'none';
        if (editBtn) editBtn.style.display = 'none';

        // Create inline edit form
        const editForm = document.createElement('div');
        editForm.className = 'displayname-edit-form';
        editForm.innerHTML = `
            <input
                type="text"
                id="inlineDisplayNameInput"
                class="displayname-input"
                placeholder="Nhập tên... (hỗ trợ emoji)"
                value="${currentDisplayName}"
                maxlength="100"
            >
            <div class="emoji-picker">
                <button type="button" class="emoji-btn" data-emoji="😊">😊</button>
                <button type="button" class="emoji-btn" data-emoji="🎉">🎉</button>
                <button type="button" class="emoji-btn" data-emoji="💖">💖</button>
                <button type="button" class="emoji-btn" data-emoji="⭐">⭐</button>
                <button type="button" class="emoji-btn" data-emoji="🔥">🔥</button>
                <button type="button" class="emoji-btn" data-emoji="✨">✨</button>
                <button type="button" class="emoji-btn" data-emoji="🌸">🌸</button>
                <button type="button" class="emoji-btn" data-emoji="🎨">🎨</button>
            </div>
            <div class="displayname-edit-actions">
                <button class="btn-cancel-inline" id="cancelInlineEdit">
                    <i data-lucide="x"></i>
                    Hủy
                </button>
                <button class="btn-save-inline" id="saveInlineEdit">
                    <i data-lucide="check"></i>
                    Lưu
                </button>
            </div>
        `;

        // Insert form after userName's parent
        const nameWrapper = userName?.parentElement || userInfoContainer;
        nameWrapper.appendChild(editForm);

        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }

        const input = editForm.querySelector('#inlineDisplayNameInput');
        const cancelBtn = editForm.querySelector('#cancelInlineEdit');
        const saveBtn = editForm.querySelector('#saveInlineEdit');
        const emojiButtons = editForm.querySelectorAll('.emoji-btn');

        // Add emoji button listeners
        emojiButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const emoji = btn.getAttribute('data-emoji');
                const cursorPos = input.selectionStart;
                const textBefore = input.value.substring(0, cursorPos);
                const textAfter = input.value.substring(input.selectionEnd);
                input.value = textBefore + emoji + textAfter;
                input.focus();
                input.selectionStart = input.selectionEnd = cursorPos + emoji.length;
            });
        });

        const closeEdit = () => {
            editForm.remove();
            if (userName) userName.style.display = '';
            if (editBtn) editBtn.style.display = '';
        };

        cancelBtn.addEventListener('click', closeEdit);

        saveBtn.addEventListener('click', async () => {
            const newDisplayName = input.value.trim();

            if (!newDisplayName) {
                this.showToast("Vui lòng nhập tên hiển thị!", "error");
                input.focus();
                return;
            }

            if (newDisplayName === currentDisplayName) {
                this.showToast("Tên hiển thị không thay đổi!", "error");
                closeEdit();
                return;
            }

            if (newDisplayName.length < 2) {
                this.showToast("Tên hiển thị phải có ít nhất 2 ký tự!", "error");
                input.focus();
                return;
            }

            saveBtn.disabled = true;
            saveBtn.innerHTML = '<i data-lucide="loader"></i> Đang lưu...';
            if (typeof lucide !== "undefined") {
                lucide.createIcons();
            }

            const success = await this.updateDisplayName(newDisplayName);

            if (success) {
                closeEdit();
                this.showToast("Đã cập nhật tên hiển thị!", "success");
                this.refreshUserInfo();
            } else {
                saveBtn.disabled = false;
                saveBtn.innerHTML = '<i data-lucide="check"></i> Lưu';
                if (typeof lucide !== "undefined") {
                    lucide.createIcons();
                }
            }
        });

        // Enter to save, Escape to cancel
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                saveBtn.click();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                closeEdit();
            }
        });

        input.focus();
        input.select();
    }

    async updateDisplayName(newDisplayName) {
        try {
            // Get auth data from storage (supporting both localStorage and sessionStorage)
            let authDataStr = localStorage.getItem("loginindex_auth") || sessionStorage.getItem("loginindex_auth");

            if (!authDataStr) {
                this.showToast("Không tìm thấy thông tin người dùng!", "error");
                return false;
            }

            const authData = JSON.parse(authDataStr);

            if (!authData || !authData.username) {
                this.showToast("Không tìm thấy thông tin người dùng!", "error");
                return false;
            }

            const username = authData.username;

            // Update Firebase
            if (typeof firebase !== "undefined" && firebase.firestore) {
                const db = firebase.firestore();
                await db.collection("users").doc(username).update({
                    displayName: newDisplayName,
                    lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
                });

                console.log("[Edit DisplayName] Updated Firebase successfully");
            } else {
                this.showToast("Không thể kết nối Firebase!", "error");
                return false;
            }

            // Update storage (both localStorage and sessionStorage)
            authData.displayName = newDisplayName;

            const authDataString = JSON.stringify(authData);

            // Update localStorage if exists
            if (localStorage.getItem("loginindex_auth")) {
                localStorage.setItem("loginindex_auth", authDataString);
                console.log("[Edit DisplayName] Updated localStorage");
            }

            // Update sessionStorage if exists
            if (sessionStorage.getItem("loginindex_auth")) {
                sessionStorage.setItem("loginindex_auth", authDataString);
                console.log("[Edit DisplayName] Updated sessionStorage");
            }

            return true;
        } catch (error) {
            console.error("[Edit DisplayName] Error:", error);
            this.showToast("Có lỗi xảy ra khi cập nhật. Vui lòng thử lại!", "error");
            return false;
        }
    }

    refreshUserInfo() {
        const userInfo = window.authManager?.getUserInfo();
        if (!userInfo) return;

        // Update mobile top bar
        const mobileUserName = document.querySelector(".mobile-user-name");
        if (mobileUserName) {
            mobileUserName.textContent = userInfo.displayName || "User";
        }

        // Update desktop sidebar
        const userName = document.getElementById("userName");
        if (userName) {
            userName.textContent = userInfo.displayName || "User";
        }

        console.log("[Unified Nav] User info refreshed");
    }

    // =====================================================
    // SETTINGS FUNCTIONALITY
    // =====================================================

    loadSettings() {
        const savedFontSize = localStorage.getItem("appFontSize") || "14";
        this.applyFontSize(parseInt(savedFontSize));

        const savedTheme = localStorage.getItem("appTheme") || "light";
        this.applyTheme(savedTheme);

        console.log("[Unified Nav] Settings loaded");
    }

    applyFontSize(size) {
        const limitedSize = Math.max(12, Math.min(20, size));
        document.documentElement.style.setProperty(
            "--base-font-size",
            `${limitedSize}px`,
        );
        document.body.style.fontSize = `${limitedSize}px`;
        console.log(`[Unified Nav] Font size applied: ${limitedSize}px`);
    }

    saveFontSize(size) {
        localStorage.setItem("appFontSize", size.toString());
        this.applyFontSize(size);
    }

    applyTheme(theme) {
        if (theme === "dark") {
            document.documentElement.classList.add("dark-mode");
        } else {
            document.documentElement.classList.remove("dark-mode");
        }
        console.log(`[Unified Nav] Theme applied: ${theme}`);
    }

    saveTheme(theme) {
        localStorage.setItem("appTheme", theme);
        this.applyTheme(theme);
    }

    showSettings() {
        const currentFontSize =
            parseInt(localStorage.getItem("appFontSize")) || 14;
        const currentTableFontSize =
            parseInt(localStorage.getItem("ordersTableFontSize")) || 14;
        const currentTheme = localStorage.getItem("appTheme") || "light";

        const modal = document.createElement("div");
        modal.className = "settings-modal-overlay";
        modal.innerHTML = `
            <div class="settings-modal">
                <div class="settings-header">
                    <h2>
                        <i data-lucide="settings"></i>
                        Cài Đặt Hiển Thị
                    </h2>
                    <button class="settings-close" id="closeSettings">
                        <i data-lucide="x"></i>
                    </button>
                </div>

                <div class="settings-content">
                    <div class="setting-group">
                        <label class="setting-label">
                            <i data-lucide="sun"></i>
                            Chế Độ Hiển Thị
                        </label>
                        <div class="theme-toggle-container">
                            <button class="theme-option ${currentTheme === "light" ? "active" : ""}" data-theme="light">
                                <i data-lucide="sun"></i>
                                <span>Sáng</span>
                            </button>
                            <button class="theme-option ${currentTheme === "dark" ? "active" : ""}" data-theme="dark">
                                <i data-lucide="moon"></i>
                                <span>Tối</span>
                            </button>
                        </div>
                    </div>

                    <div class="setting-group">
                        <label class="setting-label">
                            <i data-lucide="type"></i>
                            Kích Thước Chữ
                        </label>
                        <div class="font-size-slider-container">
                            <div class="slider-labels">
                                <span class="slider-label-min">12px</span>
                                <span class="slider-label-current" id="currentFontSize">${currentFontSize}px</span>
                                <span class="slider-label-max">20px</span>
                            </div>
                            <input
                                type="range"
                                id="fontSizeSlider"
                                class="font-size-slider"
                                min="12"
                                max="20"
                                value="${currentFontSize}"
                                step="1"
                            >
                            <div class="slider-ticks">
                                <span>12</span>
                                <span>14</span>
                                <span>16</span>
                                <span>18</span>
                                <span>20</span>
                            </div>
                        </div>
                    </div>

                    <div class="setting-group">
                        <label class="setting-label">
                            <i data-lucide="table"></i>
                            Kích Thước Chữ Bảng Đơn Hàng
                        </label>
                        <div class="font-size-slider-container">
                            <div class="slider-labels">
                                <span class="slider-label-min">10px</span>
                                <span class="slider-label-current" id="currentTableFontSize">${currentTableFontSize}px</span>
                                <span class="slider-label-max">20px</span>
                            </div>
                            <input
                                type="range"
                                id="tableFontSizeSlider"
                                class="font-size-slider"
                                min="10"
                                max="20"
                                value="${currentTableFontSize}"
                                step="1"
                            >
                            <div class="slider-ticks">
                                <span>10</span>
                                <span>12</span>
                                <span>14</span>
                                <span>16</span>
                                <span>18</span>
                                <span>20</span>
                            </div>
                        </div>
                    </div>

                    <div class="setting-group">
                        <label class="setting-label">
                            <i data-lucide="eye"></i>
                            Xem Trước
                        </label>
                        <div class="settings-preview">
                            <p>Đây là văn bản mẫu để xem trước kích thước chữ.</p>
                            <p>This is sample text to preview font size.</p>
                            <p style="font-weight: 600;">Chữ đậm / Bold text</p>
                            <div style="margin-top: 12px; padding: 12px; background: rgba(99, 102, 241, 0.1); border-radius: 8px;">
                                <span style="font-size: 12px;">Chữ nhỏ 12px</span> •
                                <span style="font-size: 14px;">Bình thường 14px</span> •
                                <span style="font-size: 16px;">Lớn 16px</span>
                            </div>
                        </div>
                    </div>
                    ${this.isAdminTemplate ? `
                    <div class="setting-group">
                        <label class="setting-label">
                            <i data-lucide="layout-grid"></i>
                            Quản Lý Menu
                        </label>
                        <button class="settings-edit-menu-btn" id="settingsEditMenuBtn">
                            <i data-lucide="grip-vertical"></i>
                            <span>Sửa Menu Sidebar</span>
                            <i data-lucide="chevron-right" style="margin-left: auto; width: 16px; height: 16px; opacity: 0.5;"></i>
                        </button>
                    </div>
                    ` : ''}

                    <div class="setting-group">
                        <label class="setting-label">
                            <i data-lucide="tag"></i>
                            Cài Đặt Mã Sản Phẩm
                        </label>
                        <div class="prefix-rules-section">
                            <div class="prefix-default-row">
                                <label>Prefix mặc định:</label>
                                <input type="text" id="defaultPrefixInput" class="prefix-input" maxlength="5" placeholder="N" ${!this.isAdminTemplate ? 'disabled' : ''}>
                            </div>
                            <table class="prefix-rules-table" id="prefixRulesTable">
                                <thead>
                                    <tr>
                                        <th>Tên bắt đầu</th>
                                        <th>Mã tạo</th>
                                        ${this.isAdminTemplate ? '<th></th>' : ''}
                                    </tr>
                                </thead>
                                <tbody id="prefixRulesBody">
                                    <tr><td colspan="3" style="text-align:center; color:#999;">Đang tải...</td></tr>
                                </tbody>
                            </table>
                            ${this.isAdminTemplate ? `
                            <button class="btn-add-prefix-rule" id="addPrefixRule">
                                <i data-lucide="plus" style="width:14px;height:14px;"></i>
                                Thêm quy tắc
                            </button>
                            ` : ''}
                        </div>
                    </div>

                    <div class="setting-group">
                        <label class="setting-label">
                            <i data-lucide="key"></i>
                            TPOS Account
                        </label>
                        <div class="tpos-accounts-section">
                            <div class="tpos-account-row">
                                <div class="tpos-account-info">
                                    <span class="tpos-account-label">NJD LIVE (Company 1)</span>
                                    <span class="tpos-account-user">nvktlive1</span>
                                </div>
                                <button class="btn-switch-company" id="switchToCompany2From1" title="Switch account nvktlive1 sang Company 2">
                                    <i data-lucide="arrow-right-left" style="width:14px;height:14px;"></i>
                                    Switch → C2
                                </button>
                            </div>
                            <div class="tpos-account-row">
                                <div class="tpos-account-info">
                                    <span class="tpos-account-label">NJD SHOP (Company 2)</span>
                                    <span class="tpos-account-user">nvktshop1</span>
                                </div>
                                <button class="btn-switch-company" id="switchToCompany1From2" title="Switch account nvktshop1 sang Company 1">
                                    <i data-lucide="arrow-right-left" style="width:14px;height:14px;"></i>
                                    Switch → C1
                                </button>
                            </div>
                            <div class="tpos-account-status" id="tposSwitchStatus"></div>
                        </div>
                    </div>
                </div>

                <div class="settings-footer">
                    <button class="btn-reset" id="resetSettings">
                        <i data-lucide="rotate-ccw"></i>
                        Đặt Lại Mặc Định
                    <button class="btn-save" id="saveSettings">
                        <i data-lucide="check"></i>
                        Áp Dụng
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }

        this.addSettingsStyles();

        const closeBtn = modal.querySelector("#closeSettings");
        const saveBtn = modal.querySelector("#saveSettings");
        const resetBtn = modal.querySelector("#resetSettings");
        const fontSlider = modal.querySelector("#fontSizeSlider");
        const currentSizeLabel = modal.querySelector("#currentFontSize");
        const tableFontSlider = modal.querySelector("#tableFontSizeSlider");
        const currentTableSizeLabel = modal.querySelector("#currentTableFontSize");
        const themeButtons = modal.querySelectorAll(".theme-option");

        let selectedFontSize = currentFontSize;
        let selectedTableFontSize = currentTableFontSize;
        let selectedTheme = currentTheme;

        const closeModal = () => modal.remove();

        closeBtn.addEventListener("click", closeModal);
        modal.addEventListener("click", (e) => {
            if (e.target === modal) closeModal();
        });

        fontSlider.addEventListener("input", (e) => {
            selectedFontSize = parseInt(e.target.value);
            currentSizeLabel.textContent = `${selectedFontSize}px`;
            this.applyFontSize(selectedFontSize);
        });

        tableFontSlider.addEventListener("input", (e) => {
            selectedTableFontSize = parseInt(e.target.value);
            currentTableSizeLabel.textContent = `${selectedTableFontSize}px`;
        });

        themeButtons.forEach((btn) => {
            btn.addEventListener("click", () => {
                themeButtons.forEach((b) => b.classList.remove("active"));
                btn.classList.add("active");
                selectedTheme = btn.dataset.theme;
                this.applyTheme(selectedTheme);
            });
        });

        resetBtn.addEventListener("click", () => {
            selectedFontSize = 14;
            selectedTableFontSize = 14;
            selectedTheme = "light";

            fontSlider.value = 14;
            currentSizeLabel.textContent = "14px";

            tableFontSlider.value = 14;
            currentTableSizeLabel.textContent = "14px";

            themeButtons.forEach((b) => b.classList.remove("active"));
            const lightBtn = modal.querySelector('[data-theme="light"]');
            if (lightBtn) lightBtn.classList.add("active");

            this.applyFontSize(14);
            this.applyTheme("light");
        });

        saveBtn.addEventListener("click", () => {
            this.saveFontSize(selectedFontSize);
            this.saveTheme(selectedTheme);
            localStorage.setItem("ordersTableFontSize", selectedTableFontSize.toString());
            closeModal();
            this.showToast("Đã lưu cài đặt thành công!", "success");
        });

        // Edit menu button (admin only)
        const editMenuBtn = modal.querySelector("#settingsEditMenuBtn");
        if (editMenuBtn) {
            editMenuBtn.addEventListener("click", () => {
                closeModal();
                this.showMenuEditModal();
            });
        }

        // --- Prefix Rules ---
        this._initPrefixRulesUI(modal);

        // --- TPOS SwitchCompany buttons ---
        this._initTposSwitchButtons(modal);
    }

    /**
     * Initialize TPOS SwitchCompany buttons in settings modal
     */
    _initTposSwitchButtons(modal) {
        const PROXY_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev';
        const TOKEN_URL = `${PROXY_URL}/api/token`;
        const SWITCH_URL = `${PROXY_URL}/api/odata/ApplicationUser/ODataService.SwitchCompany`;
        const CREDENTIALS = {
            1: { username: 'nvktlive1', password: 'Aa@28612345678' },
            2: { username: 'nvktshop1', password: 'Aa@28612345678' }
        };

        const statusEl = modal.querySelector('#tposSwitchStatus');

        const doSwitch = async (sourceCompanyId, targetCompanyId, btn) => {
            const creds = CREDENTIALS[sourceCompanyId];
            btn.disabled = true;
            btn.textContent = 'Đang xử lý...';
            if (statusEl) statusEl.textContent = '';

            try {
                // Step 1: Login with source account
                const loginResp = await fetch(TOKEN_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: `grant_type=password&username=${creds.username}&password=${encodeURIComponent(creds.password)}&client_id=tmtWebApp`
                });
                if (!loginResp.ok) throw new Error(`Login failed: ${loginResp.status}`);
                const loginData = await loginResp.json();

                // Step 2: SwitchCompany
                const switchResp = await fetch(SWITCH_URL, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${loginData.access_token}`,
                        'Content-Type': 'application/json;charset=UTF-8',
                        'Accept': 'application/json',
                        'feature-version': '2',
                        'tposappversion': '6.2.6.1'
                    },
                    body: JSON.stringify({ companyId: targetCompanyId })
                });
                if (!switchResp.ok) throw new Error(`SwitchCompany failed: ${switchResp.status}`);

                // Step 3: Refresh token to get new company token
                const refreshResp = await fetch(TOKEN_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Authorization': `Bearer ${loginData.access_token}`
                    },
                    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(loginData.refresh_token)}&client_id=tmtWebApp`
                });
                if (!refreshResp.ok) throw new Error(`Token refresh failed: ${refreshResp.status}`);

                const newToken = await refreshResp.json();
                // Save to localStorage under target company key
                const storageKey = `bearer_token_data_${targetCompanyId}`;
                const dataToSave = {
                    access_token: newToken.access_token,
                    refresh_token: newToken.refresh_token || null,
                    token_type: 'Bearer',
                    expires_in: newToken.expires_in,
                    expires_at: Date.now() + (newToken.expires_in * 1000),
                    issued_at: Date.now()
                };
                localStorage.setItem(storageKey, JSON.stringify(dataToSave));

                if (statusEl) {
                    statusEl.textContent = `OK! Account ${creds.username} switched to Company ${targetCompanyId}. Token saved.`;
                    statusEl.style.color = '#22c55e';
                }
                console.log(`[Settings] SwitchCompany: ${creds.username} → Company ${targetCompanyId} OK`);
            } catch (err) {
                console.error('[Settings] SwitchCompany error:', err);
                if (statusEl) {
                    statusEl.textContent = `Lỗi: ${err.message}`;
                    statusEl.style.color = '#ef4444';
                }
            } finally {
                btn.disabled = false;
                btn.innerHTML = `<i data-lucide="arrow-right-left" style="width:14px;height:14px;"></i> Switch → C${targetCompanyId === 1 ? '1' : '2'}`;
                if (typeof lucide !== 'undefined') lucide.createIcons();
            }
        };

        const btn1 = modal.querySelector('#switchToCompany2From1');
        const btn2 = modal.querySelector('#switchToCompany1From2');
        if (btn1) btn1.addEventListener('click', () => doSwitch(1, 2, btn1));
        if (btn2) btn2.addEventListener('click', () => doSwitch(2, 1, btn2));
    }

    /**
     * Initialize prefix rules UI in settings modal
     */
    async _initPrefixRulesUI(modal) {
        const tbody = modal.querySelector('#prefixRulesBody');
        const defaultInput = modal.querySelector('#defaultPrefixInput');
        const addBtn = modal.querySelector('#addPrefixRule');
        const saveBtn = modal.querySelector('#saveSettings');
        if (!tbody) return;

        // Load current rules from Firestore
        let rules = [];
        let defaultPrefix = 'N';
        try {
            if (window.firebase && window.firebase.firestore) {
                const doc = await firebase.firestore()
                    .collection('settings').doc('product_code_rules').get();
                if (doc.exists) {
                    const data = doc.data();
                    rules = data.rules || [];
                    defaultPrefix = data.defaultPrefix || 'N';
                }
            }
        } catch (e) {
            console.warn('[Settings] Failed to load prefix rules:', e.message);
        }

        // Use defaults if no rules found
        if (rules.length === 0 && window.ProductCodeGenerator) {
            rules = [...window.ProductCodeGenerator.DEFAULT_PREFIX_RULES];
            defaultPrefix = window.ProductCodeGenerator.DEFAULT_PREFIX || 'N';
        }

        if (defaultInput) defaultInput.value = defaultPrefix;

        const isAdmin = this.isAdminTemplate;

        const renderRules = () => {
            tbody.innerHTML = '';
            if (rules.length === 0) {
                tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;color:#999;padding:8px;">Chưa có quy tắc</td></tr>`;
                return;
            }
            rules.forEach((rule, idx) => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><input type="text" class="prefix-input" value="${rule.match || ''}" data-idx="${idx}" data-field="match" maxlength="10" ${!isAdmin ? 'disabled' : ''}></td>
                    <td><input type="text" class="prefix-input" value="${rule.codePrefix || ''}" data-idx="${idx}" data-field="codePrefix" maxlength="5" ${!isAdmin ? 'disabled' : ''}></td>
                    ${isAdmin ? `<td><button class="btn-delete-rule" data-idx="${idx}" title="Xóa"><i data-lucide="trash-2" style="width:14px;height:14px;"></i></button></td>` : ''}
                `;
                tbody.appendChild(tr);
            });

            if (typeof lucide !== 'undefined') lucide.createIcons();

            // Bind input change events
            if (isAdmin) {
                tbody.querySelectorAll('input.prefix-input').forEach(input => {
                    input.addEventListener('input', (e) => {
                        const idx = parseInt(e.target.dataset.idx);
                        const field = e.target.dataset.field;
                        if (rules[idx]) rules[idx][field] = e.target.value.trim();
                    });
                });

                tbody.querySelectorAll('.btn-delete-rule').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        const idx = parseInt(e.currentTarget.dataset.idx);
                        rules.splice(idx, 1);
                        renderRules();
                    });
                });
            }
        };

        renderRules();

        // Add rule button
        if (addBtn && isAdmin) {
            addBtn.addEventListener('click', () => {
                rules.push({ match: '', codePrefix: '' });
                renderRules();
                // Focus the new match input
                const lastInput = tbody.querySelector(`input[data-idx="${rules.length - 1}"][data-field="match"]`);
                if (lastInput) lastInput.focus();
            });
        }

        // Override save to also save prefix rules
        if (saveBtn && isAdmin) {
            const originalSave = saveBtn.onclick;
            saveBtn.addEventListener('click', async () => {
                // Save prefix rules to Firestore
                try {
                    const validRules = rules.filter(r => r.match && r.codePrefix);
                    const newDefaultPrefix = (defaultInput?.value || 'N').trim().toUpperCase();

                    if (window.firebase && window.firebase.firestore) {
                        await firebase.firestore()
                            .collection('settings').doc('product_code_rules')
                            .set({
                                rules: validRules,
                                defaultPrefix: newDefaultPrefix,
                                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                            });
                        console.log('[Settings] Prefix rules saved:', validRules.length, 'rules');
                    }

                    // Clear ProductCodeGenerator cache
                    if (window.ProductCodeGenerator && window.ProductCodeGenerator.clearCache) {
                        window.ProductCodeGenerator.clearCache();
                    }
                } catch (e) {
                    console.error('[Settings] Failed to save prefix rules:', e);
                }
            });
        }
    }

    addSettingsStyles() {
        if (document.getElementById("settingsStyles")) return;

        const style = document.createElement("style");
        style.id = "settingsStyles";
        style.textContent = `
            :root {
                --bg-primary: #ffffff;
                --bg-secondary: #f9fafb;
                --bg-tertiary: #f3f4f6;
                --text-primary: #111827;
                --text-secondary: #374151;
                --text-tertiary: #6b7280;
                --border-color: #e5e7eb;
                --accent-color: #6366f1;
            }

            .dark-mode {
                --bg-primary: #1f2937;
                --bg-secondary: #111827;
                --bg-tertiary: #374151;
                --text-primary: #f9fafb;
                --text-secondary: #e5e7eb;
                --text-tertiary: #9ca3af;
                --border-color: #374151;
                --accent-color: #818cf8;
            }

            .dark-mode body {
                background: var(--bg-secondary);
                color: var(--text-primary);
            }

            .settings-modal-overlay {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.5);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10000;
                padding: 20px;
                backdrop-filter: blur(4px);
            }

            .settings-modal {
                background: var(--bg-primary);
                border-radius: 16px;
                max-width: 600px;
                width: 100%;
                max-height: 90vh;
                overflow: hidden;
                display: flex;
                flex-direction: column;
                box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.2);
                animation: modalSlideIn 0.3s ease-out;
            }

            @keyframes modalSlideIn {
                from { opacity: 0; transform: translateY(-20px); }
                to { opacity: 1; transform: translateY(0); }
            }

            .settings-header {
                padding: 24px;
                border-bottom: 1px solid var(--border-color);
                display: flex;
                align-items: center;
                justify-content: space-between;
            }

            .settings-header h2 {
                margin: 0;
                font-size: 20px;
                font-weight: 600;
                color: var(--text-primary);
                display: flex;
                align-items: center;
                gap: 12px;
            }

            .settings-header h2 i { width: 24px; height: 24px; color: var(--accent-color); }

            .settings-close {
                width: 36px; height: 36px; border: none;
                background: var(--bg-tertiary); border-radius: 8px;
                cursor: pointer; display: flex; align-items: center; justify-content: center;
                transition: all 0.2s; color: var(--text-primary);
            }
            .settings-close:hover { background: var(--border-color); transform: rotate(90deg); }
            .settings-close i { width: 20px; height: 20px; }

            .settings-content { padding: 24px; overflow-y: auto; flex: 1; }
            .setting-group { margin-bottom: 28px; }
            .setting-group:last-child { margin-bottom: 0; }

            .setting-label {
                display: flex; align-items: center; gap: 8px;
                font-weight: 600; color: var(--text-secondary);
                margin-bottom: 12px; font-size: 14px;
            }
            .setting-label i { width: 18px; height: 18px; color: var(--accent-color); }

            .theme-toggle-container { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }

            .theme-option {
                padding: 16px; border: 2px solid var(--border-color);
                background: var(--bg-primary); border-radius: 12px; cursor: pointer;
                transition: all 0.2s; display: flex; flex-direction: column;
                align-items: center; gap: 8px; font-weight: 500; color: var(--text-secondary);
            }
            .theme-option:hover { border-color: var(--accent-color); background: var(--bg-secondary); }
            .theme-option.active { border-color: var(--accent-color); background: var(--bg-secondary); color: var(--accent-color); }
            .theme-option i { width: 24px; height: 24px; }
            .theme-option span { font-size: 14px; }

            .font-size-slider-container {
                background: var(--bg-secondary); padding: 20px; border-radius: 12px;
                border: 1px solid var(--border-color);
            }
            .slider-labels { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
            .slider-label-min, .slider-label-max { font-size: 12px; color: var(--text-tertiary); font-weight: 500; }
            .slider-label-current { font-size: 18px; font-weight: 700; color: var(--accent-color); }

            .font-size-slider {
                width: 100%; height: 6px; border-radius: 3px;
                background: var(--border-color); outline: none;
                -webkit-appearance: none; appearance: none; cursor: pointer;
            }
            .font-size-slider::-webkit-slider-thumb {
                -webkit-appearance: none; appearance: none; width: 20px; height: 20px;
                border-radius: 50%; background: var(--accent-color); cursor: pointer;
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2); transition: all 0.2s;
            }
            .font-size-slider::-webkit-slider-thumb:hover { transform: scale(1.2); box-shadow: 0 4px 8px rgba(99, 102, 241, 0.4); }
            .font-size-slider::-moz-range-thumb {
                width: 20px; height: 20px; border-radius: 50%; background: var(--accent-color);
                cursor: pointer; border: none; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2); transition: all 0.2s;
            }
            .font-size-slider::-moz-range-thumb:hover { transform: scale(1.2); box-shadow: 0 4px 8px rgba(99, 102, 241, 0.4); }

            .slider-ticks { display: flex; justify-content: space-between; margin-top: 8px; padding: 0 2px; }
            .slider-ticks span { font-size: 11px; color: var(--text-tertiary); font-weight: 500; }

            .settings-preview {
                padding: 20px; background: var(--bg-secondary); border-radius: 12px;
                border: 1px solid var(--border-color);
            }
            .settings-preview p { margin: 0 0 8px 0; color: var(--text-secondary); line-height: 1.6; }
            .settings-preview p:last-child { margin-bottom: 0; }

            .settings-footer {
                padding: 20px 24px; border-top: 1px solid var(--border-color);
                display: flex; gap: 12px; justify-content: flex-end; background: var(--bg-primary);
            }
            .settings-footer button {
                padding: 10px 20px; border: none; border-radius: 8px; font-weight: 600;
                font-size: 14px; cursor: pointer; display: flex; align-items: center; gap: 8px; transition: all 0.2s;
            }
            .settings-footer button i { width: 18px; height: 18px; }
            .btn-reset { background: var(--bg-tertiary); color: var(--text-secondary); }
            .btn-reset:hover { background: var(--border-color); }
            .btn-save { background: var(--accent-color); color: white; }
            .btn-save:hover { background: #4f46e5; transform: translateY(-1px); box-shadow: 0 4px 6px rgba(99, 102, 241, 0.3); }

            .toast-notification {
                position: fixed; top: 20px; right: 20px; background: var(--bg-primary);
                padding: 16px 20px; border-radius: 12px;
                box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
                display: flex; align-items: center; gap: 12px; z-index: 10001;
                animation: toastSlideIn 0.3s ease-out; border: 1px solid var(--border-color);
            }
            @keyframes toastSlideIn { from { opacity: 0; transform: translateX(100px); } to { opacity: 1; transform: translateX(0); } }
            .toast-notification.success { border-left: 4px solid #10b981; }
            .toast-notification.success i { width: 20px; height: 20px; color: #10b981; }
            .toast-notification.error { border-left: 4px solid #ef4444; }
            .toast-notification.error i { width: 20px; height: 20px; color: #ef4444; }
            .toast-notification.warning { border-left: 4px solid #f59e0b; }
            .toast-notification.warning i { width: 20px; height: 20px; color: #f59e0b; }
            .toast-notification.info { border-left: 4px solid #3b82f6; }
            .toast-notification.info i { width: 20px; height: 20px; color: #3b82f6; }
            .toast-notification span { color: var(--text-secondary); font-weight: 500; font-size: 14px; }

            body { font-size: var(--base-font-size, 14px); }

            .settings-edit-menu-btn {
                display: flex; align-items: center; gap: 10px; width: 100%;
                padding: 12px 16px; background: rgba(99, 102, 241, 0.1);
                border: 1px dashed rgba(99, 102, 241, 0.3); border-radius: 10px;
                color: var(--accent-color, #6366f1); font-size: 14px; font-weight: 500;
                cursor: pointer; transition: all 0.2s;
            }
            .settings-edit-menu-btn:hover { background: rgba(99, 102, 241, 0.2); border-color: rgba(99, 102, 241, 0.5); }
            .settings-edit-menu-btn i { width: 18px; height: 18px; }

            /* Prefix Rules Settings */
            .prefix-rules-section { display: flex; flex-direction: column; gap: 10px; }
            .prefix-default-row { display: flex; align-items: center; gap: 10px; margin-bottom: 4px; }
            .prefix-default-row label { font-size: 13px; color: var(--text-secondary); white-space: nowrap; }
            .prefix-input {
                padding: 5px 8px; border: 1px solid var(--border-color); border-radius: 6px;
                font-size: 13px; background: var(--bg-primary); color: var(--text-primary);
                width: 80px; text-align: center;
            }
            .prefix-input:disabled { opacity: 0.6; cursor: not-allowed; }
            .prefix-input:focus { outline: none; border-color: var(--accent-color); box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.2); }
            .prefix-rules-table { width: 100%; border-collapse: collapse; font-size: 13px; }
            .prefix-rules-table th {
                text-align: left; padding: 6px 8px; font-weight: 500;
                color: var(--text-tertiary); border-bottom: 1px solid var(--border-color); font-size: 12px;
            }
            .prefix-rules-table td { padding: 4px 4px; }
            .prefix-rules-table input.prefix-input { width: 100%; box-sizing: border-box; }
            .btn-delete-rule {
                border: none; background: none; cursor: pointer; color: #ef4444;
                padding: 4px; border-radius: 4px; display: flex; align-items: center; justify-content: center;
            }
            .btn-delete-rule:hover { background: rgba(239, 68, 68, 0.1); }
            .btn-add-prefix-rule {
                display: flex; align-items: center; gap: 6px; padding: 6px 12px;
                border: 1px dashed var(--border-color); background: transparent;
                border-radius: 6px; cursor: pointer; font-size: 13px;
                color: var(--accent-color); transition: all 0.2s;
            }
            .btn-add-prefix-rule:hover { background: rgba(99, 102, 241, 0.1); border-color: var(--accent-color); }

            /* TPOS Account Settings */
            .tpos-accounts-section { display: flex; flex-direction: column; gap: 8px; }
            .tpos-account-row {
                display: flex; align-items: center; justify-content: space-between;
                padding: 10px 12px; background: var(--bg-primary);
                border: 1px solid var(--border-color); border-radius: 8px;
            }
            .tpos-account-info { display: flex; flex-direction: column; gap: 2px; }
            .tpos-account-label { font-size: 13px; font-weight: 600; color: var(--text-primary); }
            .tpos-account-user { font-size: 12px; color: var(--text-secondary); font-family: monospace; }
            .btn-switch-company {
                display: flex; align-items: center; gap: 4px; padding: 6px 10px;
                border: 1px solid var(--border-color); background: transparent;
                border-radius: 6px; cursor: pointer; font-size: 12px;
                color: var(--accent-color); transition: all 0.2s; white-space: nowrap;
            }
            .btn-switch-company:hover { background: rgba(99, 102, 241, 0.1); border-color: var(--accent-color); }
            .btn-switch-company:disabled { opacity: 0.5; cursor: not-allowed; }
            .tpos-account-status { font-size: 12px; padding: 0 4px; min-height: 16px; }

            @media (max-width: 640px) {
                .theme-toggle-container { grid-template-columns: 1fr; }
                .settings-footer { flex-direction: column-reverse; }
                .settings-footer button { width: 100%; justify-content: center; }
            }
        `;
        document.head.appendChild(style);
    }

    showToast(message, type = "success") {
        const toast = document.createElement("div");
        toast.className = `toast-notification ${type}`;

        const iconMap = {
            success: "check-circle",
            error: "alert-circle",
            warning: "alert-triangle",
            info: "info"
        };

        const icon = iconMap[type] || "check-circle";

        toast.innerHTML = `
            <i data-lucide="${icon}"></i>
            <span>${message}</span>
        `;

        document.body.appendChild(toast);

        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }

        setTimeout(() => {
            toast.style.animation = "toastSlideIn 0.3s ease-out reverse";
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // =====================================================
    // LOGOUT CONFIRMATION DIALOG
    // =====================================================

    showLogoutConfirmDialog() {
        // Create overlay
        const overlay = document.createElement("div");
        overlay.className = "logout-confirm-overlay";
        overlay.innerHTML = `
            <div class="logout-confirm-dialog">
                <div class="logout-confirm-icon">
                    <i data-lucide="log-out"></i>
                </div>
                <h3 class="logout-confirm-title">Đăng Xuất</h3>
                <p class="logout-confirm-message">Bạn có chắc chắn muốn đăng xuất khỏi hệ thống?</p>
                <div class="logout-confirm-actions">
                    <button class="logout-confirm-btn logout-cancel-btn" id="logoutCancelBtn">
                        <i data-lucide="x"></i>
                        Hủy
                    </button>
                    <button class="logout-confirm-btn logout-ok-btn" id="logoutOkBtn">
                        <i data-lucide="check"></i>
                        Đăng Xuất
                    </button>
                </div>
            </div>
        `;

        // Add styles
        this.injectLogoutConfirmStyles();

        document.body.appendChild(overlay);

        // Animate in
        requestAnimationFrame(() => {
            overlay.classList.add("show");
        });

        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }

        // Event handlers
        const cancelBtn = overlay.querySelector("#logoutCancelBtn");
        const okBtn = overlay.querySelector("#logoutOkBtn");

        const closeDialog = () => {
            overlay.classList.remove("show");
            setTimeout(() => overlay.remove(), 300);
        };

        cancelBtn.addEventListener("click", closeDialog);
        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) closeDialog();
        });

        okBtn.addEventListener("click", () => {
            selectiveLogoutStorage();
            window.authManager?.logout();
        });
    }

    injectLogoutConfirmStyles() {
        if (document.getElementById("logoutConfirmStyles")) return;

        const style = document.createElement("style");
        style.id = "logoutConfirmStyles";
        style.textContent = `
            .logout-confirm-overlay {
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background: rgba(0, 0, 0, 0.6); backdrop-filter: blur(4px);
                display: flex; align-items: center; justify-content: center;
                z-index: 99999; opacity: 0; transition: opacity 0.3s ease;
            }
            .logout-confirm-overlay.show { opacity: 1; }
            .logout-confirm-dialog {
                background: linear-gradient(145deg, #1a1a2e, #16213e);
                border-radius: 20px; padding: 32px; max-width: 400px; width: 90%;
                text-align: center; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
                border: 1px solid rgba(255, 255, 255, 0.1);
                transform: scale(0.9) translateY(20px); transition: transform 0.3s ease;
            }
            .logout-confirm-overlay.show .logout-confirm-dialog { transform: scale(1) translateY(0); }
            .logout-confirm-icon {
                width: 64px; height: 64px; margin: 0 auto 20px;
                background: linear-gradient(135deg, #ef4444, #dc2626); border-radius: 50%;
                display: flex; align-items: center; justify-content: center;
            }
            .logout-confirm-icon svg { width: 32px; height: 32px; color: white; }
            .logout-confirm-title { color: #fff; font-size: 24px; font-weight: 700; margin: 0 0 12px; }
            .logout-confirm-message { color: rgba(255, 255, 255, 0.7); font-size: 15px; line-height: 1.5; margin: 0 0 28px; }
            .logout-confirm-actions { display: flex; gap: 12px; justify-content: center; }
            .logout-confirm-btn {
                flex: 1; padding: 14px 24px; border-radius: 12px; font-size: 15px; font-weight: 600;
                cursor: pointer; display: flex; align-items: center; justify-content: center;
                gap: 8px; transition: all 0.2s ease; border: none;
            }
            .logout-confirm-btn svg { width: 18px; height: 18px; }
            .logout-cancel-btn {
                background: rgba(255, 255, 255, 0.1); color: rgba(255, 255, 255, 0.8);
                border: 1px solid rgba(255, 255, 255, 0.2);
            }
            .logout-cancel-btn:hover { background: rgba(255, 255, 255, 0.15); color: #fff; }
            .logout-ok-btn { background: linear-gradient(135deg, #ef4444, #dc2626); color: white; }
            .logout-ok-btn:hover {
                background: linear-gradient(135deg, #f87171, #ef4444);
                transform: translateY(-2px); box-shadow: 0 4px 20px rgba(239, 68, 68, 0.4);
            }
        `;
        document.head.appendChild(style);
    }
}

// =====================================================
// MIXIN APPLICATION - Merge all sub-module methods into the class prototype
// =====================================================

// Apply permissions mixin
if (window._navigationPermissionsMixin) {
    Object.keys(window._navigationPermissionsMixin).forEach(key => {
        UnifiedNavigationManager.prototype[key] = window._navigationPermissionsMixin[key];
    });
}

// Apply sidebar mixin
if (window._navigationSidebarMixin) {
    Object.keys(window._navigationSidebarMixin).forEach(key => {
        UnifiedNavigationManager.prototype[key] = window._navigationSidebarMixin[key];
    });
}

// Apply mobile mixin
if (window._navigationMobileMixin) {
    Object.keys(window._navigationMobileMixin).forEach(key => {
        UnifiedNavigationManager.prototype[key] = window._navigationMobileMixin[key];
    });
}

// Export class globally
window.UnifiedNavigationManager = UnifiedNavigationManager;

// =====================================================
// INITIALIZATION
// =====================================================

function waitForDependencies(callback, maxRetries = 15, delay = 300) {
    let retries = 0;
    let resolved = false;

    const resolve = () => {
        if (resolved) return;
        resolved = true;
        console.log("[Unified Nav] Dependencies ready!");
        callback();
    };

    // Listen for sharedModulesLoaded event from compat.js
    window.addEventListener('sharedModulesLoaded', () => {
        if (window.authManager) {
            resolve();
        }
    }, { once: true });

    const check = () => {
        if (resolved) return;

        // Explicitly check window.authManager (not bare authManager)
        if (window.authManager) {
            resolve();
        } else if (retries < maxRetries) {
            retries++;
            // Debug: show what's available on first retry
            if (retries === 1) {
                console.log('[Unified Nav] Debug - _esmLoaded:', window._esmLoaded);
                console.log('[Unified Nav] Debug - _authReady:', window._authReady);
                console.log('[Unified Nav] Debug - window.authManager:', typeof window.authManager);
            }
            console.log(`[Unified Nav] Waiting... (${retries}/${maxRetries})`);
            setTimeout(check, delay);
        } else {
            console.error("[Unified Nav] Dependencies failed, redirecting...");
            console.error("[Unified Nav] Final state - _esmLoaded:", window._esmLoaded, "_authReady:", window._authReady, "authManager:", typeof window.authManager);
            selectiveLogoutStorage();
            sessionStorage.clear();
            window.location.href = "../index.html";
        }
    };

    check();
}

let unifiedNavigationManager;

function initNavigation() {
    console.log("[Unified Nav] DOM loaded...");
    waitForDependencies(() => {
        unifiedNavigationManager = new UnifiedNavigationManager();
        window.navigationManager = unifiedNavigationManager;
    });
}

// If DOM already loaded (e.g. script loaded dynamically after DOMContentLoaded), init immediately
if (document.readyState === 'loading') {
    document.addEventListener("DOMContentLoaded", initNavigation);
} else {
    initNavigation();
}

// =====================================================
// APP VERSION SYSTEM - Auto-incremented on each commit
// =====================================================

window.APP_VERSION = {
    version: '1.0.0',
    build: 9,
    timestamp: '2026-01-08T12:00:00.000Z',
    branch: 'main'
};

// =====================================================
// VERSION CHECKER - Force logout on version mismatch
// =====================================================

class VersionChecker {
    constructor() {
        this.firebaseRef = null;
        this.localVersion = window.APP_VERSION || { build: 0 };
        this.isChecking = false;
        this.unsubscribeListener = null;
    }

    /**
     * Cleanup Firestore listener to prevent memory leaks
     */
    cleanup() {
        if (this.unsubscribeListener) {
            this.unsubscribeListener();
            this.unsubscribeListener = null;
            console.log('[VERSION] Firestore listener cleaned up');
        }
    }

    /**
     * Initialize version checker
     */
    async init() {
        try {
            // Wait for Firebase to be ready
            await this.waitForFirebase();

            // Check version
            await this.checkVersion();

            // Listen for version changes
            this.setupVersionListener();

        } catch (error) {
            console.error('[VERSION] Error initializing version checker:', error);
        }
    }

    /**
     * Wait for Firebase SDK to be available
     * MIGRATION: Changed from Realtime Database to Firestore
     */
    async waitForFirebase() {
        const maxRetries = 50; // 5 seconds max
        let retries = 0;

        while (retries < maxRetries) {
            // Check for Firestore instead of Realtime Database
            if (window.firebase && window.firebase.firestore && typeof window.firebase.firestore === 'function') {
                this.firebaseRef = window.firebase.firestore().collection('app_config').doc('version');
                console.log('[VERSION] Firestore reference initialized');
                return;
            }

            await new Promise(resolve => setTimeout(resolve, 100));
            retries++;
        }

        console.warn('[VERSION] Firestore not available, version check disabled');
    }

    /**
     * Check version against Firestore
     */
    async checkVersion() {
        if (!this.firebaseRef || this.isChecking) {
            return;
        }

        this.isChecking = true;

        try {
            console.log('[VERSION] Checking version...');
            console.log('[VERSION] Local version:', this.localVersion);

            // Get version from Firestore
            const doc = await this.firebaseRef.get();
            const firebaseVersion = doc.exists ? doc.data() : null;

            console.log('[VERSION] Firestore version:', firebaseVersion);

            // If Firestore has no version, publish local version
            if (!firebaseVersion) {
                console.log('[VERSION] No version in Firestore, publishing local version...');
                await this.publishVersion();
                this.isChecking = false;
                return;
            }

            // Compare versions by timestamp (newer timestamp = force logout)
            const localTimestamp = new Date(this.localVersion.timestamp).getTime();
            const firebaseTimestamp = new Date(firebaseVersion.timestamp).getTime();

            if (firebaseTimestamp > localTimestamp) {
                console.warn('[VERSION] Version mismatch detected!');
                console.warn('[VERSION] Local timestamp:', this.localVersion.timestamp);
                console.warn('[VERSION] Firestore timestamp:', firebaseVersion.timestamp);
                console.warn('[VERSION] Local build:', this.localVersion.build);
                console.warn('[VERSION] Firestore build:', firebaseVersion.build);

                // Force logout and reload
                this.forceLogout();
            } else {
                console.log('[VERSION] Version OK (build', this.localVersion.build, 'at', this.localVersion.timestamp + ')');
            }

        } catch (error) {
            console.error('[VERSION] Error checking version:', error);
        } finally {
            this.isChecking = false;
        }
    }

    /**
     * Publish current version to Firestore
     */
    async publishVersion() {
        if (!this.firebaseRef) {
            return;
        }

        try {
            await this.firebaseRef.set(this.localVersion);
            console.log('[VERSION] Version published to Firestore:', this.localVersion);
        } catch (error) {
            console.error('[VERSION] Error publishing version:', error);
        }
    }

    /**
     * Setup listener for version changes (Firestore onSnapshot)
     */
    setupVersionListener() {
        if (!this.firebaseRef) {
            return;
        }

        let isFirstTrigger = true;

        // Use Firestore onSnapshot instead of Realtime Database .on('value')
        this.unsubscribeListener = this.firebaseRef.onSnapshot((doc) => {
            // Skip first trigger (already checked in checkVersion)
            if (isFirstTrigger) {
                isFirstTrigger = false;
                return;
            }

            const firebaseVersion = doc.exists ? doc.data() : null;
            if (!firebaseVersion) {
                return;
            }

            // Check if version changed by timestamp
            const localTimestamp = new Date(this.localVersion.timestamp).getTime();
            const firebaseTimestamp = new Date(firebaseVersion.timestamp).getTime();

            if (firebaseTimestamp > localTimestamp) {
                console.warn('[VERSION] Version changed in Firestore!');
                console.warn('[VERSION] Local timestamp:', this.localVersion.timestamp);
                console.warn('[VERSION] Firestore timestamp:', firebaseVersion.timestamp);
                console.warn('[VERSION] Local build:', this.localVersion.build);
                console.warn('[VERSION] Firestore build:', firebaseVersion.build);

                // Force logout and reload
                this.forceLogout();
            }
        });

        console.log('[VERSION] Version listener setup complete (Firestore)');
    }

    /**
     * Force logout: clear storage and redirect to login
     * CHANGED: Now only shows notification, user must manually reload
     */
    forceLogout() {
        console.log('[VERSION] Version mismatch detected, showing notification...');

        // Show notification for user to manually reload
        if (window.notificationManager) {
            window.notificationManager.warning(
                'Có phiên bản mới! Vui lòng nhấn F5 hoặc reload trang để cập nhật.',
                0,
                'Cập nhật phiên bản',
                { persistent: true }
            );
        } else {
            // Fallback: show alert
            alert('Có phiên bản mới! Vui lòng reload trang để cập nhật.');
        }

        // DO NOT auto-logout - let user decide when to reload
        // This prevents unexpected logouts
        console.log('[VERSION] User should manually reload to update');
    }

    /**
     * Manual version publish (call this when you want to force all users to logout)
     */
    async forceVersionUpdate() {
        console.log('[VERSION] Force version update triggered');
        await this.publishVersion();
    }
}

// Initialize version checker after navigation is ready
setTimeout(() => {
    if (window.APP_VERSION) {
        const versionChecker = new VersionChecker();
        window.versionChecker = versionChecker;
        versionChecker.init();
        console.log('[VERSION] Version Checker initialized');

        // Cleanup on page unload to prevent memory leaks
        window.addEventListener('beforeunload', () => {
            versionChecker.cleanup();
        });
    }
}, 2000); // Wait 2 seconds for Firebase to be ready

// =====================================================
// AI CHAT WIDGET LOADER
// Load floating AI chat widget on all pages
// =====================================================
(function loadAIChatWidget() {
    // Check if already loaded
    if (window.AIChatWidget) {
        console.log('[AI Widget] Already loaded');
        return;
    }

    // Determine script path based on current page location
    const currentPath = window.location.pathname;
    let basePath = '../shared/js/';

    // Handle different directory depths
    if (currentPath.includes('/n2store/') && !currentPath.includes('/n2store/js/')) {
        // Find the depth from n2store root
        const parts = currentPath.split('/n2store/')[1]?.split('/').filter(p => p && !p.includes('.html'));
        if (parts && parts.length > 1) {
            basePath = '../'.repeat(parts.length) + 'js/';
        }
    }

    // Create and load the script
    const script = document.createElement('script');
    script.src = basePath + 'ai-chat-widget.js';
    script.async = true;
    script.onerror = () => console.warn('[AI Widget] Failed to load widget script');
    document.head.appendChild(script);

    console.log('[AI Widget] Loading from:', basePath + 'ai-chat-widget.js');
})();

console.log('[Navigation] Core module loaded');
