let db = null;
let auth = null;
let currentMethod = "cryptojs";
let users = [];

// Tab Management
function showTab(tabName) {
    // Hide all tab contents
    document.querySelectorAll(".tab-content").forEach((content) => {
        content.classList.remove("active");
    });
    // Remove active class from all tabs
    document.querySelectorAll(".tab").forEach((tab) => {
        tab.classList.remove("active");
    });

    // Show selected tab content
    document.getElementById(tabName).classList.add("active");
    // Add active class to selected tab
    event.target.classList.add("active");
}

// Firebase Configuration
function loadDefaultConfig() {
    document.getElementById("apiKey").value =
        "AIzaSyA-legWlCgjMDEy70rsaTTwLK39F4ZCKhM";
    document.getElementById("authDomain").value =
        "n2shop-69e37.firebaseapp.com";
    document.getElementById("projectId").value = "n2shop-69e37";
    document.getElementById("storageBucket").value = "n2shop-69e37-ne0q1";
    document.getElementById("messagingSenderId").value = "598906493303";
    document.getElementById("appId").value =
        "1:598906493303:web:46d6236a1fdc2eff33e972";
}

function saveFirebaseConfig() {
    const config = {
        apiKey: document.getElementById("apiKey").value,
        authDomain: document.getElementById("authDomain").value,
        projectId: document.getElementById("projectId").value,
        storageBucket: document.getElementById("storageBucket").value,
        messagingSenderId: document.getElementById("messagingSenderId").value,
        appId: document.getElementById("appId").value,
    };

    localStorage.setItem("firebaseConfig", JSON.stringify(config));
    document.getElementById("configOutput").textContent =
        "Đã lưu cấu hình Firebase vào localStorage";
    document.getElementById("configOutput").className = "output success";
}

function connectFirebase() {
    try {
        const savedConfig = localStorage.getItem("firebaseConfig");
        let config;

        if (savedConfig) {
            config = JSON.parse(savedConfig);
        } else {
            // Use default config
            config = {
                apiKey: "AIzaSyA-legWlCgjMDEy70rsaTTwLK39F4ZCKhM",
                authDomain: "n2shop-69e37.firebaseapp.com",
                projectId: "n2shop-69e37",
                storageBucket: "n2shop-69e37-ne0q1",
                messagingSenderId: "598906493303",
                appId: "1:598906493303:web:46d6236a1fdc2eff33e972",
            };
        }

        if (!firebase.apps.length) {
            const app = firebase.initializeApp(config);
            db = firebase.firestore();
            auth = firebase.auth();

            document.getElementById("firebaseStatus").textContent =
                "✅ Đã kết nối Firebase thành công!\nProject: " +
                config.projectId;
            document.getElementById("firebaseStatus").className =
                "output success";
        } else {
            document.getElementById("firebaseStatus").textContent =
                "✅ Firebase đã được kết nối trước đó";
            document.getElementById("firebaseStatus").className =
                "output success";
        }
    } catch (error) {
        document.getElementById("firebaseStatus").textContent =
            "❌ Lỗi kết nối Firebase: " + error.message;
        document.getElementById("firebaseStatus").className = "output error";
    }
}

// Password Hash Functions
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
    text += `Check Login: ${result.checkLogin}\n`;
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
        output.textContent = "Vui lòng nhập password và hash để test!";
        return;
    }

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
            return;
        }

        if (isMatch) {
            output.textContent = `✅ Password ĐÚNG! (Method: ${method})`;
            output.className = "output success";
        } else {
            output.textContent = `❌ Password SAI! (Method: ${method})`;
            output.className = "output error";
        }
    } catch (error) {
        output.textContent = "Lỗi: " + error.message;
        output.className = "output error";
    }
}

// User Management Functions
async function createUser() {
    if (!db) {
        alert("Vui lòng kết nối Firebase trước!");
        return;
    }

    const username = document.getElementById("newUsername").value.trim();
    const password = document.getElementById("newPassword").value.trim();
    const displayName =
        document.getElementById("newDisplayName").value.trim() ||
        username.charAt(0).toUpperCase() + username.slice(1);
    const checkLogin = parseInt(document.getElementById("newCheckLogin").value);

    if (!username || !password) {
        alert("Vui lòng nhập username và password!");
        return;
    }

    const output = document.getElementById("createOutput");
    output.textContent = "Đang tạo tài khoản...";

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
        await db.collection("users").doc(username).set({
            displayName: displayName,
            checkLogin: checkLogin,
            passwordHash: hash,
            salt: salt,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        });

        output.textContent = `✅ Tạo tài khoản thành công!\nUsername: ${username}\nTên hiển thị: ${displayName}\nQuyền hạn: ${checkLogin}`;
        output.className = "output success";

        // Clear form
        document.getElementById("newUsername").value = "";
        document.getElementById("newPassword").value = "";
        document.getElementById("newDisplayName").value = "";
        document.getElementById("newCheckLogin").value = "1";

        // Reload user list
        setTimeout(loadUsers, 1000);
    } catch (error) {
        output.textContent = "❌ Lỗi tạo tài khoản: " + error.message;
        output.className = "output error";
    }
}

async function loadUsers() {
    if (!db) {
        alert("Vui lòng kết nối Firebase trước!");
        return;
    }

    const userList = document.getElementById("userList");
    userList.innerHTML =
        '<div style="padding: 20px; text-align: center;">Đang tải...</div>';

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
                '<div style="padding: 20px; text-align: center;">Không có tài khoản nào</div>';
            return;
        }

        let html = "";
        users.forEach((user, index) => {
            html += `
                        <div class="user-item">
                            <div class="user-info">
                                <strong>${user.displayName}</strong> (${user.id})<br>
                                <small>Quyền hạn: ${user.checkLogin} | ${user.createdAt ? new Date(user.createdAt.seconds * 1000).toLocaleDateString() : "N/A"}</small>
                            </div>
                            <div class="user-actions">
                                <button onclick="editUser('${user.id}')">Sửa</button>
                                <button class="danger" onclick="deleteUser('${user.id}')">Xóa</button>
                            </div>
                        </div>
                    `;
        });

        userList.innerHTML = html;
    } catch (error) {
        userList.innerHTML = `<div style="padding: 20px; color: red;">❌ Lỗi tải danh sách: ${error.message}</div>`;
    }
}

function editUser(username) {
    const user = users.find((u) => u.id === username);
    if (!user) return;

    document.getElementById("editUsername").value = user.id;
    document.getElementById("editDisplayName").value = user.displayName;
    document.getElementById("editCheckLogin").value = user.checkLogin;
    document.getElementById("editNewPassword").value = "";

    // Scroll to edit section
    document
        .querySelector("#manage .section:nth-child(4)")
        .scrollIntoView({ behavior: "smooth" });
}

async function updateUser() {
    if (!db) {
        alert("Vui lòng kết nối Firebase trước!");
        return;
    }

    const username = document.getElementById("editUsername").value.trim();
    const displayName = document.getElementById("editDisplayName").value.trim();
    const checkLogin = parseInt(
        document.getElementById("editCheckLogin").value,
    );
    const newPassword = document.getElementById("editNewPassword").value.trim();

    if (!username || !displayName) {
        alert("Vui lòng nhập username và tên hiển thị!");
        return;
    }

    const output = document.getElementById("editOutput");
    output.textContent = "Đang cập nhật tài khoản...";

    try {
        let updateData = {
            displayName: displayName,
            checkLogin: checkLogin,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        };

        // If new password is provided, hash it
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

        output.textContent = `✅ Cập nhật tài khoản thành công!\nUsername: ${username}\nTên hiển thị: ${displayName}\nQuyền hạn: ${checkLogin}${newPassword ? "\nĐã thay đổi password" : ""}`;
        output.className = "output success";

        // Reload user list
        setTimeout(loadUsers, 1000);
    } catch (error) {
        output.textContent = "❌ Lỗi cập nhật tài khoản: " + error.message;
        output.className = "output error";
    }
}

async function deleteUser(username) {
    if (!db) {
        alert("Vui lòng kết nối Firebase trước!");
        return;
    }

    if (
        !confirm(
            `Bạn có chắc chắn muốn xóa tài khoản "${username}"?\nHành động này không thể hoàn tác!`,
        )
    ) {
        return;
    }

    try {
        await db.collection("users").doc(username).delete();

        // Also try to delete from auth_users if exists
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

function clearEditForm() {
    document.getElementById("editUsername").value = "";
    document.getElementById("editDisplayName").value = "";
    document.getElementById("editCheckLogin").value = "1";
    document.getElementById("editNewPassword").value = "";
    document.getElementById("editOutput").textContent = "";
    document.getElementById("editOutput").className = "output";
}

function clearAll() {
    document.getElementById("username").value = "";
    document.getElementById("password").value = "";
    document.getElementById("displayName").value = "";
    document.getElementById("checkLogin").value = "1";
    document.getElementById("testPassword").value = "";
    document.getElementById("testHash").value = "";
    document.getElementById("testSalt").value = "";
    document.getElementById("hashOutput").textContent = "";
    document.getElementById("verifyOutput").textContent = "";

    // Reset classes
    document.getElementById("hashOutput").className = "output";
    document.getElementById("verifyOutput").className = "output";
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

// Load saved config on page load
window.addEventListener("load", () => {
    const savedConfig = localStorage.getItem("firebaseConfig");
    if (savedConfig) {
        try {
            const config = JSON.parse(savedConfig);
            document.getElementById("apiKey").value = config.apiKey || "";
            document.getElementById("authDomain").value =
                config.authDomain || "";
            document.getElementById("projectId").value = config.projectId || "";
            document.getElementById("storageBucket").value =
                config.storageBucket || "";
            document.getElementById("messagingSenderId").value =
                config.messagingSenderId || "";
            document.getElementById("appId").value = config.appId || "";
        } catch (e) {
            console.log("Could not load saved config:", e);
        }
    } else {
        // Load default config
        loadDefaultConfig();
    }

    // Check if libraries are loaded
    setTimeout(() => {
        if (typeof CryptoJS !== "undefined" && typeof bcrypt !== "undefined") {
            console.log("✅ Crypto libraries loaded successfully");
        } else {
            console.error("❌ Some crypto libraries failed to load");
        }
    }, 1000);
});

// Keyboard shortcuts
document.addEventListener("keydown", function (e) {
    // Ctrl + Enter to generate hash
    if (e.ctrlKey && e.key === "Enter") {
        if (document.getElementById("hash").classList.contains("active")) {
            generateHash();
        }
    }
});
