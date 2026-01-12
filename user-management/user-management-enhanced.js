// =====================================================
// USER MANAGEMENT WITH DETAILED PERMISSIONS
// =====================================================

let db = null;
let auth = null;
let currentMethod = "cryptojs";
let users = [];

// Check admin access - Admin (roleTemplate='admin') has FULL BYPASS
function checkAdminAccess() {
    const isLoggedIn = localStorage.getItem("isLoggedIn") || sessionStorage.getItem("isLoggedIn");
    // IMPORTANT: Check both localStorage AND sessionStorage (depends on "remember me" setting)
    const authData = localStorage.getItem("loginindex_auth") || sessionStorage.getItem("loginindex_auth");

    console.log("Checking admin access:", {
        isLoggedIn,
        authData: !!authData,
        source: localStorage.getItem("loginindex_auth") ? "localStorage" : "sessionStorage"
    });

    if (!isLoggedIn || isLoggedIn !== "true") {
        showAccessDenied("Bạn chưa đăng nhập hệ thống.");
        return false;
    }

    if (!authData) {
        showAccessDenied("Không tìm thấy thông tin đăng nhập.");
        return false;
    }

    let hasPermission = false;

    try {
        const auth = JSON.parse(authData);

        // ALL users (including Admin) check detailedPermissions - NO bypass
        if (auth.detailedPermissions && auth.detailedPermissions['user-management']) {
            const userMgmtPerms = auth.detailedPermissions['user-management'];
            hasPermission = Object.values(userMgmtPerms).some(v => v === true);
        }

        console.log("Permission check:", {
            hasDetailedPermissions: !!auth.detailedPermissions,
            hasUserManagementPermission: hasPermission,
            roleTemplate: auth.roleTemplate || 'unknown'
        });
    } catch (e) {
        console.error("Error checking permissions:", e);
    }

    if (!hasPermission) {
        showAccessDenied("Bạn không có quyền truy cập trang quản lý người dùng.");
        return false;
    }

    try {
        const auth = JSON.parse(authData);
        document.getElementById("currentUser").textContent =
            auth.displayName || auth.username || "Admin";
    } catch (e) {
        document.getElementById("currentUser").textContent = "Admin";
    }

    document.getElementById("mainContainer").style.display = "block";

    setTimeout(connectFirebase, 500);

    return true;
}

function showAccessDenied(reason = "") {
    document.getElementById("accessDenied").style.display = "block";
    document.getElementById("mainContainer").style.display = "none";

    if (reason) {
        const msg = document.querySelector("#accessDenied p");
        msg.innerHTML = reason;
    }
}

// Firebase Configuration
function connectFirebase() {
    try {
        if (!firebase.apps.length) {
            const config = {
                apiKey: "AIzaSyA-legWlCgjMDEy70rsaTTwLK39F4ZCKhM",
                authDomain: "n2shop-69e37.firebaseapp.com",
                projectId: "n2shop-69e37",
                storageBucket: "n2shop-69e37-ne0q1",
                messagingSenderId: "598906493303",
                appId: "1:598906493303:web:46d6236a1fdc2eff33e972",
            };

            const app = firebase.initializeApp(config);
            db = firebase.firestore();
            auth = firebase.auth();
        }

        document.getElementById("firebaseStatus").textContent =
            "✅ Kết nối Firebase thành công!\nProject: n2shop-69e37\nTrạng thái: Admin Access Granted";
        document.getElementById("firebaseStatus").className = "output success";

        setTimeout(loadUsers, 1000);
    } catch (error) {
        document.getElementById("firebaseStatus").textContent =
            "❌ Lỗi kết nối Firebase: " + error.message;
        document.getElementById("firebaseStatus").className = "output error";
    }
}

// Load users
async function loadUsers() {
    if (!db) {
        showError("Firebase chưa được kết nối!");
        return;
    }

    const userList = document.getElementById("userList");
    userList.innerHTML =
        '<div class="empty-state show"><i data-lucide="loader" class="spinning"></i><h3>Đang tải dữ liệu...</h3></div>';

    if (typeof lucide !== "undefined") {
        lucide.createIcons();
    }

    try {
        const snapshot = await db.collection("users").get();
        users = [];

        snapshot.forEach((doc) => {
            users.push({
                id: doc.id,
                ...doc.data(),
            });
        });

        if (users.length === 0) {
            userList.innerHTML =
                '<div class="empty-state show"><i data-lucide="user-x"></i><h3>Không có tài khoản nào</h3></div>';
            if (typeof lucide !== "undefined") {
                lucide.createIcons();
            }
            return;
        }

        users.sort((a, b) => {
            if (a.checkLogin !== b.checkLogin) {
                return a.checkLogin - b.checkLogin;
            }
            return a.displayName.localeCompare(b.displayName);
        });

        renderUserList(users);
    } catch (error) {
        userList.innerHTML = `<div class="empty-state show"><i data-lucide="alert-circle"></i><h3>Lỗi tải danh sách</h3><p>${error.message}</p></div>`;
        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }
    }
}

// =====================================================
// BULK SELECTION MANAGEMENT
// =====================================================
const selectedUsers = new Set();

function toggleUserSelection(userId, checkbox) {
    if (checkbox.checked) {
        selectedUsers.add(userId);
    } else {
        selectedUsers.delete(userId);
    }
    updateBulkToolbar();
}

function toggleSelectAll() {
    const selectAllCheckbox = document.getElementById("selectAllCheckbox");
    const checkboxes = document.querySelectorAll(".user-select-checkbox");

    if (selectAllCheckbox.checked) {
        checkboxes.forEach(cb => {
            cb.checked = true;
            selectedUsers.add(cb.dataset.userId);
        });
    } else {
        checkboxes.forEach(cb => {
            cb.checked = false;
        });
        selectedUsers.clear();
    }
    updateBulkToolbar();
}

function clearSelection() {
    selectedUsers.clear();
    document.querySelectorAll(".user-select-checkbox").forEach(cb => cb.checked = false);
    const selectAllCheckbox = document.getElementById("selectAllCheckbox");
    if (selectAllCheckbox) selectAllCheckbox.checked = false;
    updateBulkToolbar();
}

function updateBulkToolbar() {
    const toolbar = document.getElementById("bulkActionToolbar");
    const count = selectedUsers.size;

    if (toolbar) {
        if (count > 0) {
            toolbar.style.display = "flex";
            document.getElementById("selectedCount").textContent = count;
        } else {
            toolbar.style.display = "none";
        }
    }
}

function showBulkTemplateModal() {
    if (selectedUsers.size === 0) {
        showError("Vui lòng chọn ít nhất 1 user!");
        return;
    }

    // Get list of selected users for preview
    const selectedUsersList = Array.from(selectedUsers).map(uid => {
        const user = users.find(u => u.id === uid);
        return user ? `<li>${user.displayName} (${user.id})</li>` : '';
    }).join('');

    // Build template options
    const templates = typeof PERMISSION_TEMPLATES !== 'undefined' ? PERMISSION_TEMPLATES : {};
    let templateOptions = '';
    Object.entries(templates).forEach(([id, template]) => {
        if (id !== 'custom') {
            templateOptions += `
                <label class="template-option" data-template="${id}">
                    <input type="radio" name="bulkTemplate" value="${id}">
                    <div class="template-option-content" style="border-color: ${template.color}20">
                        <i data-lucide="${template.icon || 'sliders'}" style="color: ${template.color}"></i>
                        <span class="template-name">${template.name}</span>
                        <span class="template-desc">${template.description || ''}</span>
                    </div>
                </label>
            `;
        }
    });

    const modalHtml = `
        <div class="modal-overlay" id="bulkTemplateModal" onclick="if(event.target === this) closeBulkTemplateModal()">
            <div class="modal-content bulk-template-modal">
                <div class="modal-header">
                    <h3><i data-lucide="users"></i> Áp dụng Template cho ${selectedUsers.size} Users</h3>
                    <button class="modal-close" onclick="closeBulkTemplateModal()">
                        <i data-lucide="x"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="bulk-template-section">
                        <h4><i data-lucide="layout-template"></i> Chọn Template</h4>
                        <div class="template-options-grid">
                            ${templateOptions}
                        </div>
                    </div>
                    <div class="bulk-template-section">
                        <h4><i data-lucide="users"></i> Users sẽ được cập nhật</h4>
                        <div class="selected-users-preview">
                            <ul>${selectedUsersList}</ul>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="closeBulkTemplateModal()">
                        <i data-lucide="x"></i> Hủy
                    </button>
                    <button class="btn btn-primary" onclick="executeBulkApplyTemplate()">
                        <i data-lucide="check"></i> Áp dụng Template
                    </button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    lucide.createIcons();
}

function closeBulkTemplateModal() {
    const modal = document.getElementById("bulkTemplateModal");
    if (modal) modal.remove();
}

async function executeBulkApplyTemplate() {
    const selectedTemplate = document.querySelector('input[name="bulkTemplate"]:checked');

    if (!selectedTemplate) {
        showError("Vui lòng chọn một template!");
        return;
    }

    const templateId = selectedTemplate.value;
    const templateName = PERMISSION_TEMPLATES[templateId]?.name || templateId;

    // Confirm
    if (!confirm(`Bạn có chắc chắn muốn áp dụng template "${templateName}" cho ${selectedUsers.size} users?\n\nHành động này sẽ ghi đè toàn bộ quyền hiện tại của các users đã chọn.`)) {
        return;
    }

    // Get permissions from registry
    let permissions = {};
    if (typeof PermissionsRegistry !== 'undefined') {
        const templateData = PermissionsRegistry.generateTemplatePermissions(templateId);
        permissions = templateData.detailedPermissions || {};
    }

    // Show loading
    const applyBtn = document.querySelector('.bulk-template-modal .btn-primary');
    const originalText = applyBtn.innerHTML;
    applyBtn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Đang xử lý...';
    applyBtn.disabled = true;

    try {
        // Get current user info
        const authData = JSON.parse(localStorage.getItem("loginindex_auth") || sessionStorage.getItem("loginindex_auth") || "{}");
        const updatedBy = authData.username || 'unknown';

        // Batch update all selected users
        const batch = db.batch();
        selectedUsers.forEach(userId => {
            const userRef = db.collection('users').doc(userId);
            batch.update(userRef, {
                detailedPermissions: permissions,
                roleTemplate: templateId,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedBy: updatedBy
            });
        });

        await batch.commit();

        showSuccess(`Đã áp dụng template "${templateName}" cho ${selectedUsers.size} users!`);
        closeBulkTemplateModal();
        clearSelection();

        // Refresh user list
        await loadUsers();

    } catch (error) {
        console.error("Bulk apply error:", error);
        showError("Lỗi khi áp dụng template: " + error.message);
        applyBtn.innerHTML = originalText;
        applyBtn.disabled = false;
    }
}

// =====================================================
// USER LIST RENDERING (Updated with checkboxes)
// =====================================================

// Render user list
function renderUserList(users) {
    const userList = document.getElementById("userList");
    const emptyState = userList.querySelector(".empty-state");

    if (!users || users.length === 0) {
        if (emptyState) emptyState.classList.add("show");
        return;
    }

    if (emptyState) emptyState.classList.remove("show");

    // Build bulk action toolbar and header
    let html = `
        <div class="user-list-header">
            <div class="user-select-cell">
                <input type="checkbox" id="selectAllCheckbox" onchange="toggleSelectAll()" title="Chọn tất cả">
            </div>
            <div class="user-list-header-info">
                <span class="user-count">${users.length} users</span>
            </div>
            <div id="bulkActionToolbar" class="bulk-action-toolbar" style="display: none;">
                <span class="selected-info">
                    <i data-lucide="check-square"></i>
                    Đã chọn <strong id="selectedCount">0</strong> users
                </span>
                <button class="btn btn-primary btn-sm" onclick="showBulkTemplateModal()">
                    <i data-lucide="layout-template"></i>
                    Áp dụng Template
                </button>
                <button class="btn btn-secondary btn-sm" onclick="clearSelection()">
                    <i data-lucide="x"></i>
                    Bỏ chọn
                </button>
            </div>
        </div>
    `;

    users.forEach((user) => {
        // NEW: Get role info from roleTemplate instead of checkLogin
        const roleInfo = getRoleTemplateInfo(user.roleTemplate);

        // Count detailed permissions and derive page access count
        let permissionCount = 0;
        let accessiblePagesCount = 0;
        if (user.detailedPermissions) {
            Object.entries(user.detailedPermissions).forEach(([pageId, pagePerms]) => {
                const pagePermCount = Object.values(pagePerms).filter(v => v === true).length;
                permissionCount += pagePermCount;
                // User has access to this page if at least one permission is true
                if (pagePermCount > 0) accessiblePagesCount++;
            });
        }

        // Total permissions available
        let totalPerms = 0;
        Object.values(DETAILED_PERMISSIONS).forEach((page) => {
            totalPerms += Object.keys(page.subPermissions).length;
        });

        const createdDate = user.createdAt
            ? new Date(user.createdAt.seconds * 1000).toLocaleDateString(
                  "vi-VN",
              )
            : "N/A";
        const updatedDate = user.updatedAt
            ? " | Cập nhật: " +
              new Date(user.updatedAt.seconds * 1000).toLocaleDateString(
                  "vi-VN",
              )
            : "";

        const isSelected = selectedUsers.has(user.id);
        html += `
            <div class="user-list-item ${isSelected ? 'selected' : ''}">
                <div class="user-select-cell">
                    <input type="checkbox" class="user-select-checkbox"
                           data-user-id="${user.id}"
                           ${isSelected ? 'checked' : ''}
                           onchange="toggleUserSelection('${user.id}', this)">
                </div>
                <div class="user-list-info">
                    <div class="user-avatar-large">
                        <i data-lucide="user"></i>
                    </div>
                    <div class="user-list-details">
                        <div class="user-list-name">${user.displayName} <span style="color: var(--text-tertiary); font-weight: normal">(${user.id})</span></div>
                        <div class="user-list-meta">
                            <span class="user-role-badge" style="background: ${roleInfo.color}15; color: ${roleInfo.color}; border: 1px solid ${roleInfo.color}30;">
                                <i data-lucide="${roleInfo.icon}"></i>
                                ${roleInfo.name}
                            </span>
                            <span><i data-lucide="layout-grid" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> ${accessiblePagesCount} trang</span>
                            <span><i data-lucide="shield-check" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> ${permissionCount}/${totalPerms} quyền</span>
                            <span><i data-lucide="calendar" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> ${createdDate}${updatedDate}</span>
                        </div>
                    </div>
                </div>
                <div class="user-list-actions">
                    <button class="btn-icon" onclick="editUser('${user.id}')" title="Chỉnh sửa">
                        <i data-lucide="edit"></i>
                    </button>
                    <button class="btn-icon" onclick="viewUserPermissions('${user.id}')" title="Xem quyền">
                        <i data-lucide="eye"></i>
                    </button>
                    <button class="btn-icon danger" onclick="deleteUser('${user.id}')" title="Xóa">
                        <i data-lucide="trash-2"></i>
                    </button>
                </div>
            </div>
        `;
    });

    userList.innerHTML = html;
    lucide.createIcons();
}

// Helper functions
function getRoleClass(checkLogin) {
    const classes = {
        0: "admin",
        1: "user",
        2: "limited",
        3: "basic",
        777: "guest",
    };
    return classes[checkLogin] || "user";
}

function getRoleIcon(checkLogin) {
    const icons = {
        0: "crown",
        1: "user",
        2: "lock",
        3: "circle",
        777: "user-x",
    };
    return icons[checkLogin] || "user";
}

function getRoleName(checkLogin) {
    const names = {
        0: "Admin",
        1: "User",
        2: "Limited",
        3: "Basic",
        777: "Guest",
    };
    return names[checkLogin] || "Unknown";
}

function getRoleText(checkLogin) {
    return getRoleName(checkLogin);
}

/**
 * Lấy thông tin role từ roleTemplate (NEW SYSTEM)
 * @param {string} roleTemplate - Template name (admin, manager, sales-team, etc.)
 * @returns {Object} - { name, icon, color }
 */
function getRoleTemplateInfo(roleTemplate) {
    // Check PERMISSION_TEMPLATES from registry
    if (typeof PERMISSION_TEMPLATES !== 'undefined' && PERMISSION_TEMPLATES[roleTemplate]) {
        const info = PERMISSION_TEMPLATES[roleTemplate];
        return {
            id: roleTemplate,
            name: info.name?.split(' - ')[0] || roleTemplate,
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
        id: roleTemplate || 'custom',
        ...(defaultTemplates[roleTemplate] || defaultTemplates['custom'])
    };
}

/**
 * Render role badge HTML từ roleTemplate
 * @param {string} roleTemplate - Template name
 * @returns {string} - HTML string
 */
function renderRoleBadge(roleTemplate) {
    const info = getRoleTemplateInfo(roleTemplate);
    return `<span class="role-badge" style="background: ${info.color}20; color: ${info.color}; border: 1px solid ${info.color}40;">
        <i data-lucide="${info.icon}" style="width: 12px; height: 12px;"></i>
        ${info.name}
    </span>`;
}

// =====================================================
// USER MANAGEMENT CRUD OPERATIONS - PART 2
// =====================================================

// Edit user
function editUser(username) {
    const user = users.find((u) => u.id === username);
    if (!user) return;

    document.getElementById("editUsername").value = user.id;
    document.getElementById("editDisplayName").value = user.displayName;
    document.getElementById("editIdentifier").value = user.identifier || "";
    document.getElementById("editNewPassword").value = "";

    // Load detailed permissions and roleTemplate (NEW SYSTEM)
    if (window.editDetailedPermUI) {
        window.editDetailedPermUI.setPermissions(user.detailedPermissions || {});
        // Set the currentTemplate so it's saved correctly on update
        window.editDetailedPermUI.currentTemplate = user.roleTemplate || 'custom';
    }

    document.querySelector('[data-tab="manage"]').click();
    document
        .querySelector("#manage .card:nth-child(3)")
        .scrollIntoView({ behavior: "smooth" });
}

// View user permissions
function viewUserPermissions(username) {
    const user = users.find((u) => u.id === username);
    if (!user) return;

    let report = `QUYỀN HẠN CHI TIẾT\n`;
    report += `${"=".repeat(60)}\n\n`;
    report += `Tài khoản: ${user.displayName} (${user.id})\n`;
    report += `Vai trò: ${getRoleText(user.checkLogin)}\n\n`;

    const permissions = user.detailedPermissions || {};
    let totalGranted = 0;

    Object.values(DETAILED_PERMISSIONS).forEach((page) => {
        const pagePerms = permissions[page.id] || {};
        const granted = Object.entries(pagePerms).filter(
            ([_, v]) => v === true,
        );

        if (granted.length > 0) {
            report += `📄 ${page.name}\n`;
            granted.forEach(([subKey, _]) => {
                const subPerm = page.subPermissions[subKey];
                report += `   ✓ ${subPerm.name}\n`;
                totalGranted++;
            });
            report += "\n";
        }
    });

    if (totalGranted === 0) {
        report += "⚠️ Không có quyền nào được cấp\n";
    } else {
        report += `\nTổng cộng: ${totalGranted} quyền\n`;
    }

    alert(report);
}

// Update user
async function updateUser() {
    if (!db) {
        showError("Firebase chưa được kết nối!");
        return;
    }

    const username = document.getElementById("editUsername").value.trim();
    const displayName = document.getElementById("editDisplayName").value.trim();
    const identifier = document.getElementById("editIdentifier").value.trim();
    const newPassword = document.getElementById("editNewPassword").value.trim();

    if (!username || !displayName) {
        showError("Vui lòng nhập đầy đủ thông tin!");
        return;
    }

    // Get detailed permissions from UI (page access is derived from this)
    const detailedPermissions = window.editDetailedPermUI
        ? window.editDetailedPermUI.getPermissions()
        : {};

    // Get roleTemplate from UI (which template is currently applied)
    const roleTemplate = window.editDetailedPermUI?.currentTemplate || 'custom';

    const loadingId = showFloatingAlert(
        "Đang cập nhật tài khoản...",
        "loading",
    );

    try {
        let updateData = {
            displayName: displayName,
            identifier: identifier,
            detailedPermissions: detailedPermissions,
            roleTemplate: roleTemplate,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedBy: JSON.parse(localStorage.getItem("loginindex_auth"))
                .username,
        };

        if (newPassword) {
            const salt = CryptoJS.lib.WordArray.random(128 / 8).toString();
            const hash = CryptoJS.PBKDF2(newPassword, salt, {
                keySize: 256 / 32,
                iterations: 1000,
            }).toString();

            updateData.passwordHash = hash;
            updateData.salt = salt;
        }

        await db.collection("users").doc(username).update(updateData);

        if (window.notify) {
            window.notify.remove(loadingId);
        }

        // Count permissions and derive accessible pages
        let permCount = 0;
        let accessiblePages = 0;
        Object.entries(detailedPermissions).forEach(([pageId, pagePerms]) => {
            const grantedCount = Object.values(pagePerms).filter(v => v === true).length;
            permCount += grantedCount;
            if (grantedCount > 0) accessiblePages++;
        });

        showSuccess(
            `Cập nhật thành công!\nUsername: ${username}\nTên hiển thị: ${displayName}\nNhóm quyền: ${roleTemplate}\nTruy cập trang: ${accessiblePages} trang\nQuyền chi tiết: ${permCount} quyền${newPassword ? "\n🔒 Đã thay đổi password" : ""}`,
        );

        setTimeout(loadUsers, 1000);
        setTimeout(() => {
            clearEditForm();
        }, 3000);
    } catch (error) {
        if (window.notify) {
            window.notify.remove(loadingId);
        }
        showError("Lỗi cập nhật: " + error.message);
    }
}

// Create user
async function createUser() {
    if (!db) {
        showError("Firebase chưa được kết nối!");
        return;
    }

    const username = document
        .getElementById("newUsername")
        .value.trim()
        .toLowerCase();
    const password = document.getElementById("newPassword").value.trim();
    const displayName =
        document.getElementById("newDisplayName").value.trim() ||
        username.charAt(0).toUpperCase() + username.slice(1);
    const identifier = document.getElementById("newIdentifier").value.trim();

    if (!username || !password) {
        showError("Vui lòng nhập username và password!");
        return;
    }

    if (!/^[a-z0-9_]+$/.test(username)) {
        showError(
            "Username chỉ được chứa chữ cái thường, số và dấu gạch dưới!",
        );
        return;
    }

    if (password.length < 6) {
        showError("Password phải có ít nhất 6 ký tự!");
        return;
    }

    // Get detailed permissions from UI (page access is derived from this)
    const detailedPermissions = window.newDetailedPermUI
        ? window.newDetailedPermUI.getPermissions()
        : {};

    // Get roleTemplate from UI (which template is currently applied)
    const roleTemplate = window.newDetailedPermUI?.currentTemplate || 'custom';

    const loadingId = showFloatingAlert("Đang tạo tài khoản...", "loading");

    try {
        const userDoc = await db.collection("users").doc(username).get();
        if (userDoc.exists) {
            if (window.notify) {
                window.notify.remove(loadingId);
            }
            showError("Username đã tồn tại!");
            return;
        }

        const salt = CryptoJS.lib.WordArray.random(128 / 8).toString();
        const hash = CryptoJS.PBKDF2(password, salt, {
            keySize: 256 / 32,
            iterations: 1000,
        }).toString();

        await db
            .collection("users")
            .doc(username)
            .set({
                displayName: displayName,
                identifier: identifier,
                detailedPermissions: detailedPermissions,
                roleTemplate: roleTemplate,
                passwordHash: hash,
                salt: salt,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                createdBy: JSON.parse(localStorage.getItem("loginindex_auth"))
                    .username,
            });

        if (window.notify) {
            window.notify.remove(loadingId);
        }

        // Count permissions and derive accessible pages
        let permCount = 0;
        let accessiblePages = 0;
        Object.entries(detailedPermissions).forEach(([pageId, pagePerms]) => {
            const grantedCount = Object.values(pagePerms).filter(v => v === true).length;
            permCount += grantedCount;
            if (grantedCount > 0) accessiblePages++;
        });

        showSuccess(
            `Tạo tài khoản thành công!\n\nUsername: ${username}\nTên hiển thị: ${displayName}\nNhóm quyền: ${roleTemplate}\nTruy cập trang: ${accessiblePages} trang\nQuyền chi tiết: ${permCount} quyền\n🔒 Password đã được hash an toàn`,
        );

        clearCreateForm();
        setTimeout(loadUsers, 1000);
    } catch (error) {
        if (window.notify) {
            window.notify.remove(loadingId);
        }
        showError("Lỗi tạo tài khoản: " + error.message);
    }
}

// Delete user
async function deleteUser(username) {
    if (!db) {
        showError("Firebase chưa được kết nối!");
        return;
    }

    const user = users.find((u) => u.id === username);
    if (!user) return;

    // NEW SYSTEM: Check roleTemplate instead of checkLogin
    const adminCount = users.filter((u) => u.roleTemplate === 'admin').length;
    if (user.roleTemplate === 'admin' && adminCount === 1) {
        showError(
            "Không thể xóa admin cuối cùng!\nHệ thống phải có ít nhất 1 admin.",
        );
        return;
    }

    // Count permissions
    let permCount = 0;
    if (user.detailedPermissions) {
        Object.values(user.detailedPermissions).forEach((pagePerms) => {
            permCount += Object.values(pagePerms).filter(
                (v) => v === true,
            ).length;
        });
    }

    // NEW SYSTEM: Display roleTemplate instead of checkLogin
    const roleInfo = getRoleTemplateInfo(user.roleTemplate);
    const confirmMsg = `XÁC NHẬN XÓA TÀI KHOẢN\n\nUsername: ${username}\nTên: ${user.displayName}\nNhóm quyền: ${roleInfo.name}\nQuyền chi tiết: ${permCount} quyền\n\nHành động này KHÔNG THỂ HOÀN TÁC!\n\nBạn có chắc chắn muốn xóa?`;

    if (!confirm(confirmMsg)) {
        return;
    }

    const loadingId = showFloatingAlert("Đang xóa tài khoản...", "loading");

    try {
        await db.collection("users").doc(username).delete();

        try {
            const authUsersSnapshot = await db
                .collection("auth_users")
                .where("username", "==", username)
                .get();
            authUsersSnapshot.forEach(async (doc) => {
                await doc.ref.delete();
            });
        } catch (authError) {
            console.log("Could not delete from auth_users:", authError);
        }

        if (window.notify) {
            window.notify.remove(loadingId);
        }

        showSuccess(`Đã xóa tài khoản "${username}" thành công!`);
        loadUsers();
    } catch (error) {
        if (window.notify) {
            window.notify.remove(loadingId);
        }
        showError("Lỗi xóa tài khoản: " + error.message);
    }
}

// Load permissions overview
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
        const snapshot = await db.collection("users").get();
        const permissionStats = {};
        const roleStats = {};

        // Initialize stats
        Object.values(DETAILED_PERMISSIONS).forEach((page) => {
            permissionStats[page.id] = {};
            Object.keys(page.subPermissions).forEach((subKey) => {
                permissionStats[page.id][subKey] = {
                    name: page.subPermissions[subKey].name,
                    icon: page.subPermissions[subKey].icon,
                    pageName: page.name,
                    count: 0,
                    users: [],
                };
            });
        });

        let totalUsers = 0;

        snapshot.forEach((doc) => {
            const user = doc.data();
            totalUsers++;

            // NEW SYSTEM: Use roleTemplate for role stats
            const roleInfo = getRoleTemplateInfo(user.roleTemplate);
            const role = roleInfo.name;
            roleStats[role] = (roleStats[role] || 0) + 1;

            const permissions = user.detailedPermissions || {};
            Object.entries(permissions).forEach(([pageId, pagePerms]) => {
                Object.entries(pagePerms).forEach(([subKey, granted]) => {
                    if (
                        granted &&
                        permissionStats[pageId] &&
                        permissionStats[pageId][subKey]
                    ) {
                        permissionStats[pageId][subKey].count++;
                        permissionStats[pageId][subKey].users.push(
                            user.displayName || doc.id,
                        );
                    }
                });
            });
        });

        let html = `
            <div style="background: white; padding: 20px; border-radius: 10px; margin-bottom: 20px;">
                <h3><i data-lucide="bar-chart-2" style="width:20px;height:20px;display:inline-block;vertical-align:middle;margin-right:8px;"></i>Thống Kê Tổng Quan</h3>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-top: 15px;">
        `;

        Object.entries(roleStats).forEach(([role, count]) => {
            html += `
                <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; text-align: center;">
                    <div style="font-size: 24px; font-weight: bold; color: #007bff;">${count}</div>
                    <div style="font-size: 14px; color: #6c757d;">${role}</div>
                </div>
            `;
        });

        html += `
                </div>
            </div>
            <div style="background: white; padding: 20px; border-radius: 10px;">
                <h3><i data-lucide="shield-check" style="width:20px;height:20px;display:inline-block;vertical-align:middle;margin-right:8px;"></i>Thống Kê Quyền Chi Tiết</h3>
                <div style="margin-top: 15px;">
        `;

        // Group by page
        Object.entries(permissionStats).forEach(([pageId, subPerms]) => {
            const page = DETAILED_PERMISSIONS[pageId];

            html += `<div style="margin-bottom: 25px;">`;
            html += `<h4 style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">`;
            html += `<i data-lucide="${page.icon}" style="width:18px;height:18px;"></i>`;
            html += `${page.name}</h4>`;

            Object.entries(subPerms).forEach(([subKey, stats]) => {
                const percentage =
                    totalUsers > 0
                        ? Math.round((stats.count / totalUsers) * 100)
                        : 0;

                html += `
                    <div style="margin-bottom: 12px; padding: 12px; border: 1px solid #dee2e6; border-radius: 8px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                            <span style="font-size: 0.875rem;"><i data-lucide="${stats.icon}" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:6px;"></i>${stats.name}</span>
                            <span style="background: #007bff; color: white; padding: 2px 8px; border-radius: 12px; font-size: 11px;">
                                ${stats.count}/${totalUsers} (${percentage}%)
                            </span>
                        </div>
                        <div style="background: #e9ecef; height: 6px; border-radius: 3px; overflow: hidden;">
                            <div style="background: #007bff; height: 100%; width: ${percentage}%; transition: width 0.3s ease;"></div>
                        </div>
                        ${
                            stats.users.length > 0
                                ? `
                            <div style="margin-top: 6px; font-size: 11px; color: #6c757d;">
                                <strong>Users:</strong> ${stats.users.join(", ")}
                            </div>
                        `
                                : ""
                        }
                    </div>
                `;
            });

            html += `</div>`;
        });

        html += "</div></div>";
        overview.innerHTML = html;

        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }
    } catch (error) {
        overview.innerHTML = `<div class="empty-state show"><i data-lucide="alert-circle"></i><h3>Lỗi tải thống kê</h3><p>${error.message}</p></div>`;
        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }
    }
}

// Export permissions
async function exportPermissions() {
    if (users.length === 0) {
        showError("Vui lòng tải danh sách users trước!");
        return;
    }

    try {
        let csv = "Username,Display Name,Role,";

        // Add all permission columns
        Object.values(DETAILED_PERMISSIONS).forEach((page) => {
            Object.values(page.subPermissions).forEach((subPerm) => {
                csv += `${page.name} - ${subPerm.name},`;
            });
        });
        csv += "Total Permissions,Created Date\n";

        users.forEach((user) => {
            const permissions = user.detailedPermissions || {};
            const createdDate = user.createdAt
                ? new Date(user.createdAt.seconds * 1000).toLocaleDateString(
                      "vi-VN",
                  )
                : "N/A";

            csv += `${user.id},"${user.displayName}","${getRoleText(user.checkLogin)}",`;

            let totalPerms = 0;
            Object.values(DETAILED_PERMISSIONS).forEach((page) => {
                Object.keys(page.subPermissions).forEach((subKey) => {
                    const hasPermission =
                        permissions[page.id]?.[subKey] || false;
                    csv += hasPermission ? "YES," : "NO,";
                    if (hasPermission) totalPerms++;
                });
            });

            csv += `${totalPerms},"${createdDate}"\n`;
        });

        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);

        link.setAttribute("href", url);
        link.setAttribute(
            "download",
            `N2Shop_Detailed_Permissions_${new Date().toISOString().split("T")[0]}.csv`,
        );
        link.style.visibility = "hidden";

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        showSuccess("Đã xuất báo cáo quyền chi tiết thành công!");
    } catch (error) {
        showError("Lỗi xuất báo cáo: " + error.message);
    }
}

// Export users
async function exportUsers() {
    if (users.length === 0) {
        showError("Không có dữ liệu để xuất!");
        return;
    }

    try {
        let csv =
            "Username,Display Name,Role,Role Code,Total Permissions,Created Date,Updated Date\n";

        users.forEach((user) => {
            const createdDate = user.createdAt
                ? new Date(user.createdAt.seconds * 1000).toLocaleDateString(
                      "vi-VN",
                  )
                : "N/A";
            const updatedDate = user.updatedAt
                ? new Date(user.updatedAt.seconds * 1000).toLocaleDateString(
                      "vi-VN",
                  )
                : "N/A";

            let permCount = 0;
            if (user.detailedPermissions) {
                Object.values(user.detailedPermissions).forEach((pagePerms) => {
                    permCount += Object.values(pagePerms).filter(
                        (v) => v === true,
                    ).length;
                });
            }

            csv += `${user.id},"${user.displayName}","${getRoleText(user.checkLogin)}",${user.checkLogin},${permCount},"${createdDate}","${updatedDate}"\n`;
        });

        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);

        link.setAttribute("href", url);
        link.setAttribute(
            "download",
            `N2Shop_Users_${new Date().toISOString().split("T")[0]}.csv`,
        );
        link.style.visibility = "hidden";

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        showSuccess("✅ Đã xuất file CSV thành công!");
    } catch (error) {
        showError("❌ Lỗi xuất file: " + error.message);
    }
}

// Clear forms
function clearEditForm() {
    document.getElementById("editUsername").value = "";
    document.getElementById("editDisplayName").value = "";
    document.getElementById("editIdentifier").value = "";
    document.getElementById("editNewPassword").value = "";

    // Clear detailed permissions UI (simplified system - only detailedPermissions)
    if (window.editDetailedPermUI) {
        window.editDetailedPermUI.setPermissions({});
    }

    const output = document.getElementById("editOutput");
    output.style.display = "none";
    output.textContent = "";
    output.className = "output";
}

function clearCreateForm() {
    document.getElementById("newUsername").value = "";
    document.getElementById("newPassword").value = "";
    document.getElementById("newDisplayName").value = "";
    document.getElementById("newIdentifier").value = "";

    // Clear detailed permissions UI (simplified system - only detailedPermissions)
    if (window.newDetailedPermUI) {
        window.newDetailedPermUI.setPermissions({});
    }

    const output = document.getElementById("createOutput");
    output.style.display = "none";
    output.textContent = "";
    output.className = "output";
}

// Helper functions for notifications
function showFloatingAlert(message, type = "info") {
    if (window.notify) {
        if (type === "loading") {
            return window.notify.loading(message);
        }
        window.notify.show(message, type, 3000);
    }
}

function showSuccess(message) {
    if (window.notify) {
        window.notify.success(message);
    }
}

function showError(message) {
    if (window.notify) {
        window.notify.error(message);
    }
}

// Auto-fill display name
document.getElementById("newUsername")?.addEventListener("input", function () {
    const username = this.value.trim();
    if (username && !document.getElementById("newDisplayName").value) {
        document.getElementById("newDisplayName").value =
            username.charAt(0).toUpperCase() + username.slice(1);
    }
});

// Initialize page
document.addEventListener("DOMContentLoaded", function () {
    console.log("Enhanced User Management page loading...");

    if (!checkAdminAccess()) {
        return;
    }

    console.log(
        "Enhanced User Management initialized with detailed permissions",
    );

    setTimeout(() => {
        if (typeof CryptoJS !== "undefined" && typeof bcrypt !== "undefined") {
            console.log("✅ Crypto libraries loaded successfully");
        } else {
            console.warn("⚠️ Some crypto libraries failed to load");
        }
    }, 1000);

    // Note: PagePermissionsUI removed - now using simplified system with only detailedPermissions
    // DetailedPermissionsUI is initialized in detailed-permissions-ui.js
    console.log("✅ User Management initialized with simplified permission system");
});

console.log(
    "Enhanced User Management System with Detailed Permissions initialized",
);
