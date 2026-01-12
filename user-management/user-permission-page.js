// Global variables
let db = null;
let auth = null;
let currentMethod = "cryptojs";
let users = [];

// Available pages with their info - UPDATED TO LUCIDE ICONS
const AVAILABLE_PAGES = [
    {
        id: "live",
        icon: "camera",
        name: "HÌNH ẢNH LIVE ĐẦY ĐỦ",
        description: "Xem và quản lý hình ảnh live stream",
    },
    {
        id: "livestream",
        icon: "video",
        name: "BÁO CÁO LIVESTREAM",
        description: "Xem báo cáo và thống kê livestream",
    },
    {
        id: "sanphamlive",
        icon: "shopping-bag",
        name: "SẢN PHẨM LIVESTREAM",
        description: "Xem thống kê sản phẩm livestream",
    },
    {
        id: "nhanhang",
        icon: "package",
        name: "NHẬN HÀNG",
        description: "Quản lý việc nhận hàng từ nhà cung cấp",
    },
    {
        id: "hangrotxa",
        icon: "clipboard-list",
        name: "HÀNG RỚT - XẢ",
        description: "Quản lý hàng rớt và xả hàng",
    },
    {
        id: "ib",
        icon: "message-square",
        name: "CHECK INBOX KHÁCH HÀNG",
        description: "Kiểm tra và quản lý tin nhắn khách hàng",
    },
    {
        id: "ck",
        icon: "credit-card",
        name: "THÔNG TIN CHUYỂN KHOẢN",
        description: "Quản lý thông tin chuyển khoản",
    },
    {
        id: "hanghoan",
        icon: "rotate-ccw",
        name: "HÀNG HOÀN",
        description: "Xử lý hàng hoàn trả",
    },
    {
        id: "hangdat",
        icon: "file-text",
        name: "HÀNG ĐẶT",
        description: "Quản lý đơn hàng đặt trước",
    },
    {
        id: "bangkiemhang",
        icon: "check-square",
        name: "BẢNG KIỂM HÀNG",
        description: "Kiểm tra và xác nhận hàng hóa",
    },
    {
        id: "user-management",
        icon: "users",
        name: "QUẢN LÝ TÀI KHOẢN",
        description: "Quản lý users và phân quyền (Admin only)",
    },
    {
        id: "history",
        icon: "bar-chart-2",
        name: "LỊCH SỬ CHỈNH SỬA",
        description: "Xem lịch sử thay đổi dữ liệu (Admin only)",
    },
];

// Permission templates
const PERMISSION_TEMPLATES = {
    admin: [
        "live",
        "livestream",
        "sanphamlive",
        "nhanhang",
        "hangrotxa",
        "ib",
        "ck",
        "hanghoan",
        "hangdat",
        "bangkiemhang",
        "user-management",
        "history",
    ],
    manager: [
        "live",
        "livestream",
        "sanphamlive",
        "nhanhang",
        "hangrotxa",
        "ib",
        "ck",
        "hanghoan",
        "bangkiemhang",
    ],
    staff: [
        "live",
        "livestream",
        "sanphamlive",
        "nhanhang",
        "hangrotxa",
        "ib",
        "ck",
        "hanghoan",
    ],
    viewer: ["live"],
};

// Initialize permissions grid with Lucide icons
function initializePermissionsGrid(containerId, prefix = "") {
    const container = document.getElementById(containerId);
    container.innerHTML = "";

    AVAILABLE_PAGES.forEach((page) => {
        const permissionItem = document.createElement("div");
        permissionItem.className = "permission-item";

        const checkboxId = `${prefix}perm_${page.id}`;

        permissionItem.innerHTML = `
            <div class="permission-checkbox">
                <input type="checkbox" id="${checkboxId}" value="${page.id}" 
                       onchange="updatePermissionsSummary('${containerId.replace("Grid", "Summary")}', '${prefix}perm_')">
                <i data-lucide="${page.icon}" class="permission-icon"></i>
                <span class="permission-text">${page.name}</span>
            </div>
            <div class="permission-description">${page.description}</div>
        `;

        container.appendChild(permissionItem);
    });

    // Initialize Lucide icons
    if (typeof lucide !== "undefined") {
        lucide.createIcons();
    }
}

// Update permissions summary
function updatePermissionsSummary(summaryId, prefix) {
    const checkboxes = document.querySelectorAll(
        `input[id^="${prefix}"]:checked`,
    );
    const total = AVAILABLE_PAGES.length;
    const selected = checkboxes.length;

    const summaryElement = document.getElementById(summaryId);
    if (summaryElement) {
        const countElement = summaryElement.querySelector(".permissions-count");
        countElement.textContent = `${selected}/${total} trang được chọn`;

        document
            .querySelectorAll(`input[id^="${prefix}"]`)
            .forEach((checkbox) => {
                const permItem = checkbox.closest(".permission-item");
                if (checkbox.checked) {
                    permItem.classList.add("granted");
                } else {
                    permItem.classList.remove("granted");
                }
            });
    }
}

// Apply permission template
function applyPermissionTemplate(templateName, formType = "edit") {
    const prefix = formType === "new" ? "newperm_" : "perm_";
    const summaryId =
        formType === "new" ? "newPermissionsSummary" : "permissionsSummary";

    document.querySelectorAll(`input[id^="${prefix}"]`).forEach((checkbox) => {
        checkbox.checked = false;
    });

    if (templateName !== "clear" && PERMISSION_TEMPLATES[templateName]) {
        PERMISSION_TEMPLATES[templateName].forEach((pageId) => {
            const checkbox = document.getElementById(`${prefix}${pageId}`);
            if (checkbox) {
                checkbox.checked = true;
            }
        });
    }

    updatePermissionsSummary(summaryId, prefix);
}

// Get selected permissions
function getSelectedPermissions(prefix) {
    const checkboxes = document.querySelectorAll(
        `input[id^="${prefix}"]:checked`,
    );
    return Array.from(checkboxes).map((cb) => cb.value);
}

// Set user permissions in form
function setUserPermissions(permissions, prefix = "perm_") {
    document.querySelectorAll(`input[id^="${prefix}"]`).forEach((checkbox) => {
        checkbox.checked = permissions.includes(checkbox.value);
    });

    const summaryId =
        prefix === "newperm_" ? "newPermissionsSummary" : "permissionsSummary";
    updatePermissionsSummary(summaryId, prefix);
}

// Check admin access - ALL users use detailedPermissions
function checkAdminAccess() {
    const authData = localStorage.getItem("loginindex_auth") || sessionStorage.getItem("loginindex_auth");

    console.log("Checking admin access:", {
        authData: !!authData,
    });

    if (!authData) {
        showAccessDenied("Bạn chưa đăng nhập hệ thống.");
        return false;
    }

    // ALL users (including Admin) check detailedPermissions - NO bypass
    let hasPermission = false;

    try {
        const auth = JSON.parse(authData);

        if (!auth.isLoggedIn || auth.isLoggedIn !== "true") {
            showAccessDenied("Bạn chưa đăng nhập hệ thống.");
            return false;
        }

        // Check for specific user-management permission in detailedPermissions
        if (auth.detailedPermissions && auth.detailedPermissions['user-management']) {
            const userMgmtPerms = auth.detailedPermissions['user-management'];
            hasPermission = Object.values(userMgmtPerms).some(v => v === true);
        }

        console.log("Permission check:", {
            roleTemplate: auth.roleTemplate,
            hasDetailedPermissions: !!auth.detailedPermissions,
            hasUserManagementPermission: hasPermission
        });
    } catch (e) {
        console.error("Error checking permissions:", e);
    }

    if (!hasPermission) {
        showAccessDenied("Bạn không có quyền truy cập trang này. Cần quyền 'user-management' trong detailedPermissions.");
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

    console.log("Admin access granted, connecting Firebase...");
    setTimeout(() => {
        console.log("Calling connectFirebase()...");
        connectFirebase();
    }, 500);

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
    console.log("=== connectFirebase() called ===");
    console.log("Checking Firebase availability...");
    console.log("typeof firebase:", typeof firebase);

    const statusEl = document.getElementById("firebaseStatus");

    if (typeof firebase === "undefined") {
        console.error(
            "❌ Firebase is not loaded! Check if Firebase scripts are included in HTML",
        );
        if (statusEl) {
            statusEl.textContent =
                "❌ Lỗi: Firebase scripts chưa được load. Kiểm tra HTML có các thẻ <script> Firebase.";
            statusEl.className = "output error";
        }
        return;
    }

    try {
        if (!firebase.apps.length) {
            console.log("Initializing Firebase...");
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

            console.log("✅ Firebase initialized successfully");
            console.log("db:", !!db);
            console.log("auth:", !!auth);
        } else {
            console.log("Firebase already initialized");
            if (!db) {
                db = firebase.firestore();
                console.log("Firestore reference obtained");
            }
            if (!auth) {
                auth = firebase.auth();
                console.log("Auth reference obtained");
            }
        }

        // Expose to window for debugging
        window.db = db;
        window.firebaseAuth = auth;

        // Update status element directly
        if (statusEl) {
            statusEl.textContent =
                "✅ Kết nối Firebase thành công!\nProject: n2shop-69e37\nTrạng thái: Admin Access Granted";
            statusEl.className = "output success";
            console.log("✅ Firebase status updated in UI");
        }

        // Update stat card
        const statFirebase = document.getElementById("statFirebase");
        if (statFirebase) {
            statFirebase.textContent = "Connected";
            console.log("✅ Firebase stat card updated");
        }

        console.log("Scheduling loadUsers() in 1 second...");
        setTimeout(() => {
            console.log("Now calling loadUsers()...");
            loadUsers();
        }, 1000);

        console.log("=== connectFirebase() completed ===");
    } catch (error) {
        console.error("❌ Firebase initialization error:", error);
        if (statusEl) {
            statusEl.textContent = "❌ Lỗi kết nối Firebase: " + error.message;
            statusEl.className = "output error";
        }

        const statFirebase = document.getElementById("statFirebase");
        if (statFirebase) {
            statFirebase.textContent = "Error";
        }
    }
}

// Load users with permissions
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
            updateStats(); // Update stats even if empty
            return;
        }

        users.sort((a, b) => {
            if (a.checkLogin !== b.checkLogin) {
                return a.checkLogin - b.checkLogin;
            }
            return a.displayName.localeCompare(b.displayName);
        });

        // Use the modern renderUserList function that's already defined in index.html
        if (typeof window.renderUserList === "function") {
            window.renderUserList(users);
        }

        // Update stats after loading users
        updateStats();
    } catch (error) {
        userList.innerHTML = `<div class="empty-state show"><i data-lucide="alert-circle"></i><h3>Lỗi tải danh sách</h3><p>${error.message}</p></div>`;
        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }
    }
}

// Update statistics - Use roleTemplate instead of checkLogin
function updateStats() {
    if (users && Array.isArray(users)) {
        const total = users.length;
        // Count admins by roleTemplate
        const admins = users.filter((u) => u.roleTemplate === 'admin').length;
        // Count users with any permissions
        const activeUsers = users.filter((u) => {
            if (u.roleTemplate === 'admin' || u.roleTemplate === 'manager') return true;
            if (!u.detailedPermissions) return false;
            return Object.values(u.detailedPermissions).some(pagePerms =>
                Object.values(pagePerms).some(v => v === true)
            );
        }).length;

        const statTotalUsers = document.getElementById("statTotalUsers");
        const statAdmins = document.getElementById("statAdmins");
        const statActiveUsers = document.getElementById("statActiveUsers");
        const statFirebase = document.getElementById("statFirebase");

        if (statTotalUsers) statTotalUsers.textContent = total;
        if (statAdmins) statAdmins.textContent = admins;
        if (statActiveUsers) statActiveUsers.textContent = activeUsers;
        if (statFirebase && db) statFirebase.textContent = "Connected";
    }
}

function getRoleText(checkLogin) {
    const roles = {
        0: "Admin",
        1: "User",
        2: "Limited",
        3: "Basic",
        777: "Guest",
    };
    return roles[checkLogin] || `Unknown (${checkLogin})`;
}

function getRoleColor(checkLogin) {
    const colors = {
        0: "#e74c3c",
        1: "#3498db",
        2: "#f39c12",
        3: "#27ae60",
        777: "#95a5a6",
    };
    return colors[checkLogin] || "#666";
}

// Edit user with permissions
function editUser(username) {
    const user = users.find((u) => u.id === username);
    if (!user) return;

    document.getElementById("editUsername").value = user.id;
    document.getElementById("editDisplayName").value = user.displayName;
    document.getElementById("editCheckLogin").value = user.checkLogin;
    document.getElementById("editNewPassword").value = "";

    const userPermissions = user.pagePermissions || [];
    setUserPermissions(userPermissions, "perm_");

    document.querySelector('[data-tab="manage"]').click();
    document
        .querySelector("#manage .card:nth-child(3)")
        .scrollIntoView({ behavior: "smooth" });
}

// View user permissions with Lucide icons
function viewUserPermissions(username) {
    const user = users.find((u) => u.id === username);
    if (!user) return;

    const permissions = user.pagePermissions || [];
    const permissionNames = permissions.map((pid) => {
        const page = AVAILABLE_PAGES.find((p) => p.id === pid);
        return page ? `• ${page.name}` : `• ${pid}`;
    });

    const message = `
QUYỀN TRUY CẬP

Tài khoản: ${user.displayName} (${user.id})
Vai trò: ${getRoleText(user.checkLogin)}
Tổng quyền: ${permissions.length}/${AVAILABLE_PAGES.length} trang

CÁC TRANG CÓ QUYỀN TRUY CẬP:
${permissionNames.length > 0 ? permissionNames.join("\n") : "• Không có quyền truy cập trang nào"}
    `.trim();

    alert(message);
}

// Update user with permissions
async function updateUser() {
    if (!db) {
        showError("Firebase chưa được kết nối!");
        return;
    }

    const username = document.getElementById("editUsername").value.trim();
    const displayName = document.getElementById("editDisplayName").value.trim();
    const checkLogin = parseInt(
        document.getElementById("editCheckLogin").value,
    );
    const newPassword = document.getElementById("editNewPassword").value.trim();

    if (!username || !displayName) {
        showError("Vui lòng nhập đầy đủ thông tin!");
        return;
    }

    const selectedPermissions = getSelectedPermissions("perm_");

    const loadingId = showFloatingAlert(
        "Đang cập nhật tài khoản...",
        "loading",
    );

    try {
        let updateData = {
            displayName: displayName,
            checkLogin: checkLogin,
            pagePermissions: selectedPermissions,
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

        showSuccess(
            `Cập nhật thành công!\nUsername: ${username}\nTên hiển thị: ${displayName}\nQuyền hạn: ${getRoleText(checkLogin)}\nQuyền truy cập: ${selectedPermissions.length}/${AVAILABLE_PAGES.length} trang${newPassword ? "\nĐã thay đổi password" : ""}`,
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

// Create user with permissions
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
    const checkLogin = parseInt(document.getElementById("newCheckLogin").value);

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

    const selectedPermissions = getSelectedPermissions("newperm_");

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
                checkLogin: checkLogin,
                pagePermissions: selectedPermissions,
                passwordHash: hash,
                salt: salt,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                createdBy: JSON.parse(localStorage.getItem("loginindex_auth"))
                    .username,
            });

        if (window.notify) {
            window.notify.remove(loadingId);
        }

        showSuccess(
            `Tạo tài khoản thành công!\n\nUsername: ${username}\nTên hiển thị: ${displayName}\nQuyền hạn: ${getRoleText(checkLogin)}\nQuyền truy cập: ${selectedPermissions.length}/${AVAILABLE_PAGES.length} trang\nPassword đã được hash an toàn`,
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

        AVAILABLE_PAGES.forEach((page) => {
            permissionStats[page.id] = {
                name: page.name,
                icon: page.icon,
                count: 0,
                users: [],
            };
        });

        let totalUsers = 0;

        snapshot.forEach((doc) => {
            const user = doc.data();
            totalUsers++;

            const role = getRoleText(user.checkLogin);
            roleStats[role] = (roleStats[role] || 0) + 1;

            const permissions = user.pagePermissions || [];
            permissions.forEach((permId) => {
                if (permissionStats[permId]) {
                    permissionStats[permId].count++;
                    permissionStats[permId].users.push(
                        user.displayName || doc.id,
                    );
                }
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
                <h3><i data-lucide="shield-check" style="width:20px;height:20px;display:inline-block;vertical-align:middle;margin-right:8px;"></i>Thống Kê Quyền Truy Cập Từng Trang</h3>
                <div style="margin-top: 15px;">
        `;

        Object.entries(permissionStats).forEach(([pageId, stats]) => {
            const percentage =
                totalUsers > 0
                    ? Math.round((stats.count / totalUsers) * 100)
                    : 0;
            html += `
                <div style="margin-bottom: 15px; padding: 15px; border: 1px solid #dee2e6; border-radius: 8px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <span style="font-weight: bold;"><i data-lucide="${stats.icon}" style="width:16px;height:16px;display:inline-block;vertical-align:middle;margin-right:6px;"></i>${stats.name}</span>
                        <span style="background: #007bff; color: white; padding: 4px 8px; border-radius: 12px; font-size: 12px;">
                            ${stats.count}/${totalUsers} (${percentage}%)
                        </span>
                    </div>
                    <div style="background: #e9ecef; height: 8px; border-radius: 4px; overflow: hidden;">
                        <div style="background: #007bff; height: 100%; width: ${percentage}%; transition: width 0.3s ease;"></div>
                    </div>
                    ${
                        stats.users.length > 0
                            ? `
                        <div style="margin-top: 8px; font-size: 12px; color: #6c757d;">
                            <strong>Users:</strong> ${stats.users.join(", ")}
                        </div>
                    `
                            : ""
                    }
                </div>
            `;
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

// Export permissions report
async function exportPermissions() {
    if (users.length === 0) {
        showError("Vui lòng tải danh sách users trước!");
        return;
    }

    try {
        let csv = "Username,Display Name,Role,Role Code,";
        AVAILABLE_PAGES.forEach((page) => {
            csv += `${page.name.replace(/,/g, " ")},`;
        });
        csv += "Total Permissions,Created Date\n";

        users.forEach((user) => {
            const permissions = user.pagePermissions || [];
            const createdDate = user.createdAt
                ? new Date(user.createdAt.seconds * 1000).toLocaleDateString(
                      "vi-VN",
                  )
                : "N/A";

            csv += `${user.id},"${user.displayName}","${getRoleText(user.checkLogin)}",${user.checkLogin},`;

            AVAILABLE_PAGES.forEach((page) => {
                csv += permissions.includes(page.id) ? "YES," : "NO,";
            });

            csv += `${permissions.length},"${createdDate}"\n`;
        });

        const blob = new Blob([csv], {
            type: "text/csv;charset=utf-8;",
        });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);

        link.setAttribute("href", url);
        link.setAttribute(
            "download",
            `N2Shop_Permissions_${new Date().toISOString().split("T")[0]}.csv`,
        );
        link.style.visibility = "hidden";

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        showSuccess("Đã xuất báo cáo quyền thành công!");
    } catch (error) {
        showError("Lỗi xuất báo cáo: " + error.message);
    }
}

// Delete user - Use roleTemplate instead of checkLogin
async function deleteUser(username) {
    if (!db) {
        showError("Firebase chưa được kết nối!");
        return;
    }

    const user = users.find((u) => u.id === username);
    if (!user) return;

    // Check if trying to delete last admin by roleTemplate
    const adminCount = users.filter((u) => u.roleTemplate === 'admin').length;
    if (user.roleTemplate === 'admin' && adminCount === 1) {
        showError(
            "Không thể xóa admin cuối cùng!\nHệ thống phải có ít nhất 1 admin.",
        );
        return;
    }

    // Count permissions from detailedPermissions
    let permCount = 0;
    if (user.detailedPermissions) {
        Object.values(user.detailedPermissions).forEach(pagePerms => {
            permCount += Object.values(pagePerms).filter(v => v === true).length;
        });
    }
    const roleText = user.roleTemplate || 'custom';
    const confirmMsg = `XÁC NHẬN XÓA TÀI KHOẢN\n\nUsername: ${username}\nTên: ${user.displayName}\nTemplate: ${roleText}\nSố quyền: ${permCount}\n\nHành động này KHÔNG THỂ HOÀN TÁC!\n\nBạn có chắc chắn muốn xóa?`;

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

// Clear forms
function clearEditForm() {
    document.getElementById("editUsername").value = "";
    document.getElementById("editDisplayName").value = "";
    document.getElementById("editCheckLogin").value = "1";
    document.getElementById("editNewPassword").value = "";
    setUserPermissions([], "perm_");
    const output = document.getElementById("editOutput");
    output.style.display = "none";
    output.textContent = "";
    output.className = "output";
}

function clearCreateForm() {
    document.getElementById("newUsername").value = "";
    document.getElementById("newPassword").value = "";
    document.getElementById("newDisplayName").value = "";
    document.getElementById("newCheckLogin").value = "1";
    setUserPermissions([], "newperm_");
    const output = document.getElementById("createOutput");
    output.style.display = "none";
    output.textContent = "";
    output.className = "output";
}

// Hash generation functions
document.querySelectorAll('input[name="method"]').forEach((radio) => {
    radio.addEventListener("change", (e) => {
        currentMethod = e.target.value;
    });
});

async function generateHash() {
    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value.trim();
    const displayName =
        document.getElementById("displayName").value.trim() ||
        username.charAt(0).toUpperCase() + username.slice(1);
    const checkLogin = parseInt(document.getElementById("checkLogin").value);

    if (!username || !password) {
        showError("Vui lòng nhập username và password!");
        return;
    }

    const output = document.getElementById("hashOutput");
    output.style.display = "block";

    try {
        let result = {
            username: username,
            displayName: displayName,
            checkLogin: checkLogin,
        };

        if (currentMethod === "cryptojs" && typeof CryptoJS !== "undefined") {
            const salt = CryptoJS.lib.WordArray.random(128 / 8).toString();
            const hash = CryptoJS.PBKDF2(password, salt, {
                keySize: 256 / 32,
                iterations: 1000,
            }).toString();

            result.passwordHash = hash;
            result.salt = salt;
            result.method = "crypto-js";
        } else if (
            currentMethod === "bcrypt" &&
            typeof bcrypt !== "undefined"
        ) {
            showFloatingAlert("Đang tạo bcrypt hash...", "loading");
            const saltRounds = 10;
            const hash = await bcrypt.hash(password, saltRounds);

            result.passwordHash = hash;
            result.method = "bcrypt";
        } else {
            showError("Lỗi: Thư viện crypto chưa load!");
            return;
        }

        displayHashResult(output, result);

        document.getElementById("testHash").value = result.passwordHash;
        if (result.salt) {
            document.getElementById("testSalt").value = result.salt;
        }
    } catch (error) {
        showError("Lỗi: " + error.message);
        output.className = "output error";
    }
}

function displayHashResult(output, result) {
    let text = `Tạo hash thành công!\n\n`;
    text += `Method: ${result.method}\n`;
    text += `Username: ${result.username}\n`;
    text += `Display Name: ${result.displayName}\n`;
    text += `Check Login: ${result.checkLogin} (${getRoleText(result.checkLogin)})\n`;
    text += `Password Hash: ${result.passwordHash}\n`;
    if (result.salt) {
        text += `Salt: ${result.salt}\n`;
    }

    text += `\n--- Firebase Document ---\n`;
    text += `Collection: users\n`;
    text += `Document ID: ${result.username}\n\n`;
    text += JSON.stringify(
        {
            displayName: result.displayName,
            checkLogin: result.checkLogin,
            passwordHash: result.passwordHash,
            pagePermissions: [],
            ...(result.salt && { salt: result.salt }),
        },
        null,
        2,
    );

    output.textContent = text;
    output.className = "output success";
}

async function verifyPassword() {
    const testPassword = document.getElementById("testPassword").value.trim();
    const testHash = document.getElementById("testHash").value.trim();
    const testSalt = document.getElementById("testSalt").value.trim();
    const output = document.getElementById("verifyOutput");

    if (!testPassword || !testHash) {
        output.style.display = "block";
        output.textContent = "Vui lòng nhập password và hash để test!";
        output.className = "output error";
        return;
    }

    output.style.display = "block";

    try {
        let isMatch = false;
        let method = "";

        if (typeof bcrypt !== "undefined" && testHash.startsWith("$2")) {
            isMatch = await bcrypt.compare(testPassword, testHash);
            method = "bcrypt";
        } else if (typeof CryptoJS !== "undefined" && testSalt) {
            const computedHash = CryptoJS.PBKDF2(testPassword, testSalt, {
                keySize: 256 / 32,
                iterations: 1000,
            }).toString();
            isMatch = computedHash === testHash;
            method = "crypto-js";
        } else {
            output.textContent = "Không thể xác định method hoặc thiếu salt!";
            output.className = "output error";
            return;
        }

        if (isMatch) {
            output.textContent = `Password ĐÚNG!\nMethod: ${method}\nHash khớp với password đã nhập.`;
            output.className = "output success";
        } else {
            output.textContent = `Password SAI!\nMethod: ${method}\nHash không khớp với password đã nhập.`;
            output.className = "output error";
        }
    } catch (error) {
        output.textContent = "Lỗi: " + error.message;
        output.className = "output error";
    }
}

function clearHashForm() {
    document.getElementById("username").value = "";
    document.getElementById("password").value = "";
    document.getElementById("displayName").value = "";
    document.getElementById("checkLogin").value = "1";
    const output = document.getElementById("hashOutput");
    output.style.display = "none";
    output.textContent = "";
    output.className = "output";
}

// Auto-fill display name
document.getElementById("username")?.addEventListener("input", function () {
    const username = this.value.trim();
    if (username && !document.getElementById("displayName").value) {
        document.getElementById("displayName").value =
            username.charAt(0).toUpperCase() + username.slice(1);
    }
});

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

    initializePermissionsGrid("editPermissionsGrid", "perm_");
    initializePermissionsGrid("newPermissionsGrid", "newperm_");

    console.log("Enhanced User Management initialized with permissions system");

    setTimeout(() => {
        if (typeof CryptoJS !== "undefined" && typeof bcrypt !== "undefined") {
            console.log("Crypto libraries loaded successfully");
        } else {
            console.warn("Some crypto libraries failed to load");
        }
    }, 1000);
});

console.log("Enhanced User Management System with Permissions initialized");
