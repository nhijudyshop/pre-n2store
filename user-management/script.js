let db = null;
let auth = null;
let currentMethod = "cryptojs";
let users = [];

// Kiểm tra quyền admin ngay khi tải trang
// ALL users use detailedPermissions - NO admin bypass
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

    // Hiển thị thông tin user hiện tại
    try {
        const auth = JSON.parse(authData);
        document.getElementById("currentUser").textContent =
            auth.displayName || auth.username || "Admin";
    } catch (e) {
        document.getElementById("currentUser").textContent = "Admin";
    }

    // Hiện container chính
    document.getElementById("mainContainer").style.display = "block";

    // Tự động kết nối Firebase
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

        // Tự động tải danh sách users
        setTimeout(loadUsers, 1000);
    } catch (error) {
        document.getElementById("firebaseStatus").textContent =
            "❌ Lỗi kết nối Firebase: " + error.message;
        document.getElementById("firebaseStatus").className = "output error";
    }
}

// Tab Management
function showTab(tabName) {
    document.querySelectorAll(".tab-content").forEach((content) => {
        content.classList.remove("active");
    });
    document.querySelectorAll(".tab").forEach((tab) => {
        tab.classList.remove("active");
    });

    document.getElementById(tabName).classList.add("active");
    event.target.classList.add("active");
}

// User Management Functions
async function loadUsers() {
    if (!db) {
        alert("Firebase chưa được kết nối!");
        return;
    }

    const userList = document.getElementById("userList");
    userList.innerHTML =
        '<div style="padding: 20px; text-align: center;">⏳ Đang tải dữ liệu...</div>';

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
                '<div style="padding: 20px; text-align: center;">📝 Không có tài khoản nào</div>';
            return;
        }

        // Sắp xếp users theo quyền hạn và tên
        users.sort((a, b) => {
            if (a.checkLogin !== b.checkLogin) {
                return a.checkLogin - b.checkLogin;
            }
            return a.displayName.localeCompare(b.displayName);
        });

        let html = "";
        users.forEach((user, index) => {
            const roleText = getRoleText(user.checkLogin);
            const roleColor = getRoleColor(user.checkLogin);

            html += `
                        <div class="user-item">
                            <div class="user-info">
                                <strong style="color: ${roleColor};">${user.displayName}</strong> 
                                <span style="color: #666;">(${user.id})</span><br>
                                <small>
                                    ${roleText} | 
                                    ${user.createdAt ? new Date(user.createdAt.seconds * 1000).toLocaleDateString("vi-VN") : "N/A"}
                                    ${user.updatedAt ? " | Cập nhật: " + new Date(user.updatedAt.seconds * 1000).toLocaleDateString("vi-VN") : ""}
                                </small>
                            </div>
                            <div class="user-actions">
                                <button onclick="editUser('${user.id}')" title="Chỉnh sửa">✏️ Sửa</button>
                                <button class="danger" onclick="deleteUser('${user.id}')" title="Xóa tài khoản">🗑️ Xóa</button>
                            </div>
                        </div>
                    `;
        });

        userList.innerHTML = html;
    } catch (error) {
        userList.innerHTML = `<div style="padding: 20px; color: red;">❌ Lỗi tải danh sách: ${error.message}</div>`;
        console.error("Load users error:", error);
    }
}

function getRoleText(checkLogin) {
    const roles = {
        0: "👑 Admin",
        1: "👤 User",
        2: "🔒 Limited",
        3: "💡 Basic",
        777: "👥 Guest",
    };
    return roles[checkLogin] || `⚠️ Unknown (${checkLogin})`;
}

function getRoleColor(checkLogin) {
    const colors = {
        0: "#e74c3c", // Admin - Red
        1: "#3498db", // User - Blue
        2: "#f39c12", // Limited - Orange
        3: "#27ae60", // Basic - Green
        777: "#95a5a6", // Guest - Gray
    };
    return colors[checkLogin] || "#666";
}

function editUser(username) {
    const user = users.find((u) => u.id === username);
    if (!user) return;

    document.getElementById("editUsername").value = user.id;
    document.getElementById("editDisplayName").value = user.displayName;
    document.getElementById("editCheckLogin").value = user.checkLogin;
    document.getElementById("editNewPassword").value = "";

    // Scroll to edit section và switch tab
    showTab("manage");
    document
        .querySelector("#manage .section:nth-child(3)")
        .scrollIntoView({ behavior: "smooth" });
}

async function updateUser() {
    if (!db) {
        alert("Firebase chưa được kết nối!");
        return;
    }

    const username = document.getElementById("editUsername").value.trim();
    const displayName = document.getElementById("editDisplayName").value.trim();
    const checkLogin = parseInt(
        document.getElementById("editCheckLogin").value,
    );
    const newPassword = document.getElementById("editNewPassword").value.trim();

    if (!username || !displayName) {
        alert("Vui lòng nhập đầy đủ thông tin!");
        return;
    }

    const output = document.getElementById("editOutput");
    output.style.display = "block";
    output.textContent = "Đang cập nhật tài khoản...";
    output.className = "output";

    try {
        let updateData = {
            displayName: displayName,
            checkLogin: checkLogin,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedBy: JSON.parse(localStorage.getItem("loginindex_auth"))
                .username,
        };

        // Hash new password if provided
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

        output.textContent = `✅ Cập nhật thành công!\nUsername: ${username}\nTên hiển thị: ${displayName}\nQuyền hạn: ${getRoleText(checkLogin)}${newPassword ? "\n🔐 Đã thay đổi password" : ""}`;
        output.className = "output success";

        // Reload user list
        setTimeout(loadUsers, 1000);
        setTimeout(() => {
            clearEditForm();
        }, 3000);
    } catch (error) {
        output.textContent = "❌ Lỗi cập nhật: " + error.message;
        output.className = "output error";
    }
}

async function deleteUser(username) {
    if (!db) {
        alert("Firebase chưa được kết nối!");
        return;
    }

    const user = users.find((u) => u.id === username);
    if (!user) return;

    // Không cho phép xóa admin cuối cùng - use roleTemplate
    const adminCount = users.filter((u) => u.roleTemplate === 'admin').length;
    if (user.roleTemplate === 'admin' && adminCount === 1) {
        alert(
            "❌ Không thể xóa admin cuối cùng!\nHệ thống phải có ít nhất 1 admin.",
        );
        return;
    }

    const roleText = user.roleTemplate || 'custom';
    const confirmMsg = `⚠️ XÁC NHẬN XÓA TÀI KHOẢN\n\nUsername: ${username}\nTên: ${user.displayName}\nTemplate: ${roleText}\n\nHành động này KHÔNG THỂ HOÀN TÁC!\n\nBạn có chắc chắn muốn xóa?`;

    if (!confirm(confirmMsg)) {
        return;
    }

    try {
        // Delete from users collection
        await db.collection("users").doc(username).delete();

        // Try to delete from auth_users if exists
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

        alert(`✅ Đã xóa tài khoản "${username}" thành công!`);
        loadUsers(); // Reload user list
    } catch (error) {
        alert("❌ Lỗi xóa tài khoản: " + error.message);
    }
}

async function createUser() {
    if (!db) {
        alert("Firebase chưa được kết nối!");
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
        alert("Vui lòng nhập username và password!");
        return;
    }

    // Validate username
    if (!/^[a-z0-9_]+$/.test(username)) {
        alert("Username chỉ được chứa chữ cái thường, số và dấu gạch dưới!");
        return;
    }

    if (password.length < 6) {
        alert("Password phải có ít nhất 6 ký tự!");
        return;
    }

    const output = document.getElementById("createOutput");
    output.style.display = "block";
    output.textContent = "Đang tạo tài khoản...";
    output.className = "output";

    try {
        // Check if user exists
        const userDoc = await db.collection("users").doc(username).get();
        if (userDoc.exists) {
            output.textContent = "❌ Username đã tồn tại!";
            output.className = "output error";
            return;
        }

        // Create hash
        const salt = CryptoJS.lib.WordArray.random(128 / 8).toString();
        const hash = CryptoJS.PBKDF2(password, salt, {
            keySize: 256 / 32,
            iterations: 1000,
        }).toString();

        // Create user document
        await db
            .collection("users")
            .doc(username)
            .set({
                displayName: displayName,
                checkLogin: checkLogin,
                passwordHash: hash,
                salt: salt,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                createdBy: JSON.parse(localStorage.getItem("loginindex_auth"))
                    .username,
            });

        output.textContent = `✅ Tạo tài khoản thành công!\n\nUsername: ${username}\nTên hiển thị: ${displayName}\nQuyền hạn: ${getRoleText(checkLogin)}\n🔐 Password đã được hash an toàn`;
        output.className = "output success";

        // Clear form
        clearCreateForm();

        // Reload user list
        setTimeout(loadUsers, 1000);
    } catch (error) {
        output.textContent = "❌ Lỗi tạo tài khoản: " + error.message;
        output.className = "output error";
    }
}

// Hash Generation Functions
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
        alert("Vui lòng nhập username và password!");
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
            output.textContent = "Đang tạo bcrypt hash...";
            const saltRounds = 10;
            const hash = await bcrypt.hash(password, saltRounds);

            result.passwordHash = hash;
            result.method = "bcrypt";
        } else {
            output.textContent = "Lỗi: Thư viện crypto chưa load!";
            return;
        }

        displayHashResult(output, result);

        // Auto populate test fields
        document.getElementById("testHash").value = result.passwordHash;
        if (result.salt) {
            document.getElementById("testSalt").value = result.salt;
        }
    } catch (error) {
        output.textContent = "Lỗi: " + error.message;
        output.className = "output error";
    }
}

function displayHashResult(output, result) {
    let text = `✅ Tạo hash thành công!\n\n`;
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
            output.textContent = `✅ Password ĐÚNG!\nMethod: ${method}\nHash khớp với password đã nhập.`;
            output.className = "output success";
        } else {
            output.textContent = `❌ Password SAI!\nMethod: ${method}\nHash không khớp với password đã nhập.`;
            output.className = "output error";
        }
    } catch (error) {
        output.textContent = "Lỗi: " + error.message;
        output.className = "output error";
    }
}

// Export function
async function exportUsers() {
    if (users.length === 0) {
        alert("Không có dữ liệu để xuất!");
        return;
    }

    try {
        let csv =
            "Username,Display Name,Role,Role Code,Created Date,Updated Date\n";

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

            csv += `${user.id},"${user.displayName}","${getRoleText(user.checkLogin)}",${user.checkLogin},"${createdDate}","${updatedDate}"\n`;
        });

        const blob = new Blob([csv], {
            type: "text/csv;charset=utf-8;",
        });
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

        alert("✅ Đã xuất file CSV thành công!");
    } catch (error) {
        alert("❌ Lỗi xuất file: " + error.message);
    }
}

// Clear form functions
function clearEditForm() {
    document.getElementById("editUsername").value = "";
    document.getElementById("editDisplayName").value = "";
    document.getElementById("editCheckLogin").value = "1";
    document.getElementById("editNewPassword").value = "";
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
    const output = document.getElementById("createOutput");
    output.style.display = "none";
    output.textContent = "";
    output.className = "output";
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

// Auto-fill display name when username changes
document.getElementById("username").addEventListener("input", function () {
    const username = this.value.trim();
    if (username && !document.getElementById("displayName").value) {
        document.getElementById("displayName").value =
            username.charAt(0).toUpperCase() + username.slice(1);
    }
});

document.getElementById("newUsername").addEventListener("input", function () {
    const username = this.value.trim();
    if (username && !document.getElementById("newDisplayName").value) {
        document.getElementById("newDisplayName").value =
            username.charAt(0).toUpperCase() + username.slice(1);
    }
});

// Initialize page
document.addEventListener("DOMContentLoaded", function () {
    console.log("User Management page loading...");

    // Check admin access first
    if (!checkAdminAccess()) {
        return;
    }

    console.log("Admin access granted, initializing...");

    // Initialize crypto libraries check
    setTimeout(() => {
        if (typeof CryptoJS !== "undefined" && typeof bcrypt !== "undefined") {
            console.log("✅ Crypto libraries loaded successfully");
        } else {
            console.warn("⚠️ Some crypto libraries failed to load");
        }
    }, 1000);
});

// Security: Clear sensitive data on page unload
window.addEventListener("beforeunload", function () {
    // Clear any sensitive data if needed
    console.log("Page unloading, cleaning up...");
});

// Prevent right-click context menu in production (for non-admin templates)
document.addEventListener("contextmenu", function (e) {
    try {
        const authData = localStorage.getItem("loginindex_auth") || sessionStorage.getItem("loginindex_auth");
        if (authData) {
            const auth = JSON.parse(authData);
            // Allow right-click for admin template only (for debugging)
            if (auth.roleTemplate === 'admin') return;
        }
        e.preventDefault();
    } catch (err) {
        e.preventDefault();
    }
});

console.log("User Management System initialized");
