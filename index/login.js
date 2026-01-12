// =====================================================
// CACHE MANAGER - Persistent Storage System
// =====================================================
class CacheManager {
    constructor(config = {}) {
        this.cache = new Map();
        this.maxAge = config.CACHE_EXPIRY || 30 * 60 * 1000;
        this.stats = { hits: 0, misses: 0 };
        this.storageKey = config.storageKey || "n2shop_auth_cache";
        this.saveTimeout = null;
        this.loadFromStorage();
    }

    saveToStorage() {
        try {
            const cacheData = Array.from(this.cache.entries());
            localStorage.setItem(this.storageKey, JSON.stringify(cacheData));
            console.log(`💾 Đã lưu ${cacheData.length} items vào cache`);
        } catch (error) {
            console.warn("Không thể lưu cache:", error);
        }
    }

    loadFromStorage() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            if (!stored) return;

            const cacheData = JSON.parse(stored);
            const now = Date.now();
            let validCount = 0;

            cacheData.forEach(([key, value]) => {
                if (value.expires > now) {
                    this.cache.set(key, value);
                    validCount++;
                }
            });

            console.log(`📦 Đã load ${validCount} items từ cache`);
        } catch (error) {
            console.warn("Không thể load cache:", error);
        }
    }

    debouncedSave() {
        if (this.saveTimeout) clearTimeout(this.saveTimeout);
        this.saveTimeout = setTimeout(() => {
            this.saveToStorage();
        }, 2000);
    }

    set(key, value, type = "general") {
        const cacheKey = `${type}_${key}`;
        this.cache.set(cacheKey, {
            value,
            timestamp: Date.now(),
            expires: Date.now() + this.maxAge,
            type,
        });
        this.debouncedSave();
    }

    get(key, type = "general") {
        const cacheKey = `${type}_${key}`;
        const cached = this.cache.get(cacheKey);

        if (cached && cached.expires > Date.now()) {
            this.stats.hits++;
            console.log(`✔ Cache HIT: ${cacheKey}`);
            return cached.value;
        }

        if (cached) {
            this.cache.delete(cacheKey);
        }

        this.stats.misses++;
        console.log(`✗ Cache MISS: ${cacheKey}`);
        return null;
    }

    clear(type = null) {
        if (type) {
            for (const [key, value] of this.cache.entries()) {
                if (value.type === type) this.cache.delete(key);
            }
        } else {
            this.cache.clear();
            localStorage.removeItem(this.storageKey);
        }
        this.stats = { hits: 0, misses: 0 };
        this.saveToStorage();
    }

    cleanExpired() {
        const now = Date.now();
        let cleaned = 0;
        for (const [key, value] of this.cache.entries()) {
            if (value.expires <= now) {
                this.cache.delete(key);
                cleaned++;
            }
        }
        if (cleaned > 0) {
            this.saveToStorage();
            console.log(`🧹 Đã xóa ${cleaned} cache entries hết hạn`);
        }
        return cleaned;
    }

    invalidatePattern(pattern) {
        let invalidated = 0;
        for (const [key] of this.cache.entries()) {
            if (key.includes(pattern)) {
                this.cache.delete(key);
                invalidated++;
            }
        }
        this.saveToStorage();
        console.log(
            `Invalidated ${invalidated} cache entries matching: ${pattern}`,
        );
        return invalidated;
    }

    getStats() {
        const total = this.stats.hits + this.stats.misses;
        const hitRate =
            total > 0 ? ((this.stats.hits / total) * 100).toFixed(1) : 0;

        return {
            size: this.cache.size,
            hits: this.stats.hits,
            misses: this.stats.misses,
            hitRate: `${hitRate}%`,
            storageSize: this.getStorageSize(),
        };
    }

    getStorageSize() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            if (!stored) return "0 KB";
            const sizeKB = (stored.length / 1024).toFixed(2);
            return `${sizeKB} KB`;
        } catch {
            return "N/A";
        }
    }
}

// =====================================================
// MAIN LOGIN SYSTEM
// =====================================================
document.addEventListener("DOMContentLoaded", function () {
    const firebaseConfig = {
        apiKey: "AIzaSyA-legWlCgjMDEy70rsaTTwLK39F4ZCKhM",
        authDomain: "n2shop-69e37.firebaseapp.com",
        projectId: "n2shop-69e37",
        storageBucket: "n2shop-69e37-ne0q1",
        messagingSenderId: "598906493303",
        appId: "1:598906493303:web:46d6236a1fdc2eff33e972",
        measurementId: "G-TEJH3S2T1D",
    };

    const app = firebase.initializeApp(firebaseConfig);
    const db = firebase.firestore();
    const auth = firebase.auth();

    // Initialize Cache Manager
    const authCache = new CacheManager({
        storageKey: "n2shop_auth_cache",
        CACHE_EXPIRY: 30 * 24 * 60 * 60 * 1000, // 30 days
    });

    // Enhanced authentication configuration
    const AUTH_CONFIG = {
        SESSION_DURATION: 8 * 60 * 60 * 1000,
        REMEMBER_DURATION: 30 * 24 * 60 * 60 * 1000,
        MAX_LOGIN_ATTEMPTS: 5,
        LOCKOUT_DURATION: 5 * 60 * 1000,
    };

    // Cache DOM elements
    const usernameInput = document.getElementById("username");
    const passwordInput = document.getElementById("password");
    const rememberMeCheckbox = document.getElementById("rememberMe");
    const loginButton = document.getElementById("loginButton");
    const errorMessage = document.getElementById("errorMessage");
    const successMessage = document.getElementById("successMessage");

    // Security: Rate limiting
    let loginAttempts = 0;
    let lastAttemptTime = 0;

    // Clean expired cache on initialization
    setTimeout(() => {
        authCache.cleanExpired();
        console.log("Cache stats:", authCache.getStats());
    }, 2000);

    // Enhanced login handler
    async function handleLogin() {
        console.log("Login attempt initiated");

        if (isRateLimited()) {
            const remainingTime = Math.ceil(
                (AUTH_CONFIG.LOCKOUT_DURATION -
                    (Date.now() - lastAttemptTime)) /
                    60000,
            );
            showError(
                `Quá nhiều lần đăng nhập sai. Vui lòng thử lại sau ${remainingTime} phút.`,
            );
            return;
        }

        if (!validateInputs()) return;

        const username = usernameInput.value.trim().toLowerCase();
        const password = passwordInput.value.trim();
        const rememberMe = rememberMeCheckbox
            ? rememberMeCheckbox.checked
            : false;

        if (loginButton) {
            loginButton.classList.add("loading");
            loginButton.disabled = true;
        }

        try {
            // Check cache first
            const cachedUser = authCache.get(username, "user");
            let userData;

            if (cachedUser) {
                console.log("✔ Sử dụng user data từ cache");
                userData = cachedUser;
            } else {
                console.log("⚡ Fetching user data từ Firestore");
                const userDocRef = db.collection("users").doc(username);
                const userDoc = await userDocRef.get();

                if (!userDoc.exists) {
                    console.log("User not found in Firebase");
                    handleFailedLogin();
                    return;
                }

                userData = userDoc.data();
                // Cache user data
                authCache.set(username, userData, "user");
            }

            // Verify password
            let passwordMatch = await verifyUserPassword(password, userData);

            if (!passwordMatch) {
                console.log("Incorrect password!");
                handleFailedLogin();
                return;
            }

            // Firebase Auth login
            let authResult;
            if (auth.currentUser) {
                authResult = { user: auth.currentUser };
                console.log("Reusing existing Firebase Auth session");
            } else {
                authResult = await auth.signInAnonymously();
                console.log("Created new Firebase Auth session");
            }

            // Update auth_users collection
            try {
                const authUserRef = db
                    .collection("auth_users")
                    .doc(authResult.user.uid);
                const authUserDoc = await authUserRef.get();

                if (!authUserDoc.exists) {
                    await authUserRef.set({
                        username: username,
                        loginTime:
                            firebase.firestore.FieldValue.serverTimestamp(),
                        lastLogin:
                            firebase.firestore.FieldValue.serverTimestamp(),
                        rememberMe: rememberMe,
                    });
                    console.log("New auth mapping created");
                } else {
                    await authUserRef.update({
                        lastLogin:
                            firebase.firestore.FieldValue.serverTimestamp(),
                        rememberMe: rememberMe,
                    });
                    console.log("Auth mapping updated");
                }
            } catch (error) {
                console.log("Auth mapping error:", error);
            }

            console.log("Firebase Auth successful:", authResult.user.uid);

            // Save session with cache
            await handleSuccessfulLogin(
                username,
                {
                    displayName: userData.displayName,
                    checkLogin: userData.checkLogin,
                    password: password,
                    uid: authResult.user.uid,
                    userId: userData.userId || null, // 🆕 Pass existing userId if available
                },
                rememberMe,
            );
        } catch (error) {
            console.error("Authentication error:", error);
            handleAuthError(error);
        } finally {
            if (loginButton) {
                loginButton.classList.remove("loading");
                loginButton.disabled = false;
            }
        }
    }

    // Enhanced password verification
    async function verifyUserPassword(password, userData) {
        if (userData.passwordHash) {
            if (typeof bcrypt !== "undefined") {
                try {
                    return await bcrypt.compare(
                        password,
                        userData.passwordHash,
                    );
                } catch (error) {
                    if (userData.salt) {
                        return verifyPassword(
                            password,
                            userData.passwordHash,
                            userData.salt,
                        );
                    }
                }
            } else if (typeof CryptoJS !== "undefined" && userData.salt) {
                return verifyPassword(
                    password,
                    userData.passwordHash,
                    userData.salt,
                );
            } else {
                return userData.passwordHash === password;
            }
        } else if (userData.password) {
            return password === userData.password;
        }
        return false;
    }

    function verifyPassword(password, hash, salt) {
        if (typeof CryptoJS !== "undefined") {
            const computedHash = CryptoJS.PBKDF2(password, salt, {
                keySize: 256 / 32,
                iterations: 1000,
            }).toString();
            return computedHash === hash;
        }
        return false;
    }

    // Enhanced successful login handler with cache
    async function handleSuccessfulLogin(
        username,
        userInfo,
        rememberMe = false,
    ) {
        try {
            loginAttempts = 0;

            // Load detailed permissions and roleTemplate (NEW SYSTEM)
            let detailedPermissions = {};
            let roleTemplate = 'custom';

            const cachedPermissions = authCache.get(
                `${username}_detailed_permissions`,
                "permissions",
            );

            if (cachedPermissions) {
                console.log("✔ Sử dụng detailedPermissions từ cache");
                detailedPermissions = cachedPermissions.detailedPermissions || {};
                roleTemplate = cachedPermissions.roleTemplate || 'custom';
            } else {
                console.log("⚡ Fetching detailedPermissions từ Firestore");
                try {
                    const userDocRef = db.collection("users").doc(username);
                    const userDoc = await userDocRef.get();

                    if (userDoc.exists) {
                        const userData = userDoc.data();
                        detailedPermissions = userData.detailedPermissions || {};
                        roleTemplate = userData.roleTemplate || 'custom';

                        // Cache permissions
                        authCache.set(
                            `${username}_detailed_permissions`,
                            { detailedPermissions, roleTemplate },
                            "permissions",
                        );
                        console.log(
                            "DetailedPermissions loaded:",
                            Object.keys(detailedPermissions).length, "pages"
                        );
                    }
                } catch (error) {
                    console.error("Error loading detailedPermissions:", error);
                    // Không fallback - user phải có detailedPermissions từ Firebase
                }
            }

            const now = Date.now();
            const duration = rememberMe
                ? AUTH_CONFIG.REMEMBER_DURATION
                : AUTH_CONFIG.SESSION_DURATION;

            // Get or create persistent userId for chat system
            // Check if user already has userId (from userInfo passed in)
            let userId = userInfo.userId || null;

            // If no userId exists, create one and save to Firestore
            if (!userId) {
                userId = `user_${username}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                console.log('🆕 Creating new userId for chat system:', userId);

                // Save userId to Firestore for future logins
                try {
                    await db.collection('users').doc(username).update({
                        userId: userId,
                        userIdCreatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    console.log('✅ userId saved to Firestore');
                } catch (error) {
                    console.warn('⚠️ Could not save userId to Firestore:', error);
                }
            } else {
                console.log('✔️ Using existing userId:', userId);
            }

            const authData = {
                isLoggedIn: "true",
                userType: `${username}-${userInfo.password}`,
                checkLogin: userInfo.checkLogin.toString(), // Kept for backward display only
                timestamp: now,
                expiresAt: now + duration,
                lastActivity: now,
                displayName: userInfo.displayName,
                loginTime: new Date().toISOString(),
                username: username,
                uid: userInfo.uid,
                userId: userId,
                // NEW PERMISSION SYSTEM - Only detailedPermissions
                detailedPermissions: detailedPermissions,
                roleTemplate: roleTemplate,
                isRemembered: rememberMe,
            };

            const authDataString = JSON.stringify(authData);

            if (rememberMe) {
                localStorage.setItem("loginindex_auth", authDataString);
                localStorage.setItem("remember_login_preference", "true");
                localStorage.setItem("isLoggedIn", "true");
                localStorage.setItem(
                    "userType",
                    `${username}-${userInfo.password}`,
                );
                localStorage.setItem(
                    "checkLogin",
                    userInfo.checkLogin.toString(),
                );
                sessionStorage.removeItem("loginindex_auth");

                // Cache session data
                authCache.set("current_session", authData, "session");
                console.log(
                    "Session saved to localStorage (persistent for 30 days)",
                );
            } else {
                sessionStorage.setItem("loginindex_auth", authDataString);
                localStorage.removeItem("loginindex_auth");
                localStorage.removeItem("remember_login_preference");
                localStorage.removeItem("isLoggedIn");
                localStorage.removeItem("userType");
                localStorage.removeItem("checkLogin");

                // Cache session data
                authCache.set("current_session", authData, "session");
                console.log("Session saved to sessionStorage (session only)");
            }

            const durationText = rememberMe
                ? "30 ngày"
                : "phiên làm việc hiện tại";
            showSuccess(
                `Đăng nhập thành công! Chào mừng ${userInfo.displayName}. Sẽ giữ đăng nhập trong ${durationText}.`,
            );

            // Log cache stats
            console.log("📊 Cache statistics:", authCache.getStats());

            setTimeout(() => {
                redirectToMainApp();
            }, 1500);
        } catch (error) {
            console.error("Error saving session data:", error);
            showError("Có lỗi xảy ra khi đăng nhập. Vui lòng thử lại.");
        }
    }

    // Enhanced session validation
    function isValidSession(authData, isFromLocalStorage) {
        if (!authData || !authData.timestamp) return false;

        const now = Date.now();
        const sessionAge = now - authData.timestamp;
        const maxDuration = isFromLocalStorage
            ? AUTH_CONFIG.REMEMBER_DURATION
            : AUTH_CONFIG.SESSION_DURATION;

        if (sessionAge > maxDuration) {
            console.log("Session expired due to age");
            return false;
        }

        if (authData.expiresAt && now > authData.expiresAt) {
            console.log("Session expired due to explicit expiry");
            return false;
        }

        return true;
    }

    // Enhanced existing login check with cache
    function checkExistingLogin() {
        // Check cache first
        const cachedSession = authCache.get("current_session", "session");
        if (
            cachedSession &&
            isValidSession(cachedSession, cachedSession.isRemembered)
        ) {
            console.log("✔ Sử dụng session từ cache");
            showSuccess(`Chào mừng trở lại, ${cachedSession.displayName}`);
            setTimeout(() => {
                redirectToMainApp();
            }, 1000);
            return true;
        }

        // Check localStorage
        let authData = localStorage.getItem("loginindex_auth");
        let isFromLocalStorage = true;
        let isRemembered =
            localStorage.getItem("remember_login_preference") === "true";

        if (!authData) {
            authData = sessionStorage.getItem("loginindex_auth");
            isFromLocalStorage = false;
            isRemembered = false;
        }

        if (authData) {
            try {
                const auth = JSON.parse(authData);

                if (isValidSession(auth, isFromLocalStorage)) {
                    console.log(
                        `Valid ${isRemembered ? "persistent" : "session"} found, redirecting...`,
                    );

                    // Cache valid session
                    authCache.set("current_session", auth, "session");

                    const sessionTypeText = isRemembered
                        ? "đăng nhập dài hạn"
                        : "phiên làm việc";
                    showSuccess(
                        `Chào mừng trở lại, ${auth.displayName} (${sessionTypeText})`,
                    );

                    setTimeout(() => {
                        redirectToMainApp();
                    }, 1000);
                    return true;
                } else {
                    console.log("Session expired, clearing data");
                    clearAllAuthData();
                }
            } catch (error) {
                console.error("Invalid session data:", error);
                clearAllAuthData();
            }
        }

        const legacyLogin = localStorage.getItem("isLoggedIn");
        if (legacyLogin === "true") {
            console.log("Found legacy session, migrating...");
            clearAllAuthData();
        }

        return false;
    }

    // Clear all authentication data including cache
    function clearAllAuthData() {
        // Clear cache
        authCache.clear("session");
        authCache.clear("user");
        authCache.clear("permissions");

        // Clear storage
        localStorage.removeItem("loginindex_auth");
        localStorage.removeItem("remember_login_preference");
        sessionStorage.removeItem("loginindex_auth");
        localStorage.removeItem("isLoggedIn");
        localStorage.removeItem("userType");
        localStorage.removeItem("checkLogin");
        sessionStorage.removeItem("justLoggedIn");

        console.log("🧹 Đã xóa tất cả auth data và cache");
    }

    // Rate limiting check
    function isRateLimited() {
        if (loginAttempts >= AUTH_CONFIG.MAX_LOGIN_ATTEMPTS) {
            const timeSinceLastAttempt = Date.now() - lastAttemptTime;
            if (timeSinceLastAttempt < AUTH_CONFIG.LOCKOUT_DURATION) {
                return true;
            } else {
                loginAttempts = 0;
            }
        }
        return false;
    }

    // Input validation
    function validateInputs() {
        if (!usernameInput || !passwordInput) {
            showError("Lỗi hệ thống: Không tìm thấy trường nhập liệu");
            return false;
        }

        const username = usernameInput.value.trim();
        const password = passwordInput.value.trim();

        if (!username) {
            showError("Vui lòng nhập tên đăng nhập");
            usernameInput.focus();
            return false;
        }

        if (!password) {
            showError("Vui lòng nhập mật khẩu");
            passwordInput.focus();
            return false;
        }

        return true;
    }

    // Handle failed login
    function handleFailedLogin() {
        loginAttempts++;
        lastAttemptTime = Date.now();

        if (passwordInput) {
            passwordInput.value = "";
            passwordInput.focus();
        }

        const remainingAttempts =
            AUTH_CONFIG.MAX_LOGIN_ATTEMPTS - loginAttempts;
        if (remainingAttempts > 0) {
            showError(
                `Thông tin đăng nhập không chính xác. Còn lại ${remainingAttempts} lần thử.`,
            );
        } else {
            showError(
                `Quá nhiều lần đăng nhập sai. Tài khoản bị khóa ${AUTH_CONFIG.LOCKOUT_DURATION / 60000} phút.`,
            );
        }
    }

    // Handle authentication errors
    function handleAuthError(error) {
        if (error.code === "unavailable") {
            showError("Không thể kết nối Firebase. Kiểm tra kết nối mạng.");
        } else if (error.code === "permission-denied") {
            showError("Không có quyền truy cập dữ liệu.");
        } else {
            showError("Lỗi hệ thống. Vui lòng thử lại sau.");
        }
        handleFailedLogin();
    }

    // Show error message
    function showError(message) {
        if (errorMessage) {
            errorMessage.textContent = message;
            errorMessage.classList.add("show");
            setTimeout(() => {
                if (errorMessage.classList.contains("show")) {
                    errorMessage.classList.remove("show");
                }
            }, 5000);
        }
        console.error("Login error:", message);
    }

    // Show success message
    function showSuccess(message) {
        if (successMessage) {
            successMessage.textContent = message;
            successMessage.classList.add("show");
            setTimeout(() => {
                if (successMessage.classList.contains("show")) {
                    successMessage.classList.remove("show");
                }
            }, 3000);
        }
        console.log("Login success:", message);
    }

    // Redirect to main application
    function redirectToMainApp() {
        sessionStorage.setItem("justLoggedIn", "true");
        const timestamp = Date.now();
        window.location.href = `./live/index.html?t=${timestamp}`;
    }

    // Setup event listeners
    function setupEventListeners() {
        if (loginButton) {
            loginButton.addEventListener("click", function (e) {
                e.preventDefault();
                handleLogin();
            });
        }

        if (document.getElementById("loginForm")) {
            document
                .getElementById("loginForm")
                .addEventListener("submit", function (e) {
                    e.preventDefault();
                    handleLogin();
                });
        }

        if (usernameInput) {
            usernameInput.addEventListener("keypress", handleKeyPress);
        }

        if (passwordInput) {
            passwordInput.addEventListener("keypress", handleKeyPress);
        }

        if (rememberMeCheckbox) {
            rememberMeCheckbox.addEventListener("change", function () {
                const isChecked = this.checked;
                const durationText = isChecked
                    ? "30 ngày"
                    : "phiên làm việc hiện tại";
                console.log(
                    `Remember me ${isChecked ? "enabled" : "disabled"}: ${durationText}`,
                );
            });
        }
    }

    // Handle key press events
    function handleKeyPress(e) {
        if (e.key === "Enter") {
            e.preventDefault();
            handleLogin();
        }
    }

    // Initialize the login system
    function initialize() {
        console.log("Initializing enhanced login system with cache...");
        setupEventListeners();

        setTimeout(() => {
            if (!checkExistingLogin()) {
                console.log("No valid session, showing login form");
                if (usernameInput) usernameInput.focus();
            }
        }, 1000);
    }

    // Start initialization
    initialize();

    // Periodic cache cleanup (every 5 minutes)
    setInterval(
        () => {
            const cleaned = authCache.cleanExpired();
            if (cleaned > 0) {
                console.log(
                    `🧹 Auto cleanup: removed ${cleaned} expired entries`,
                );
            }
        },
        5 * 60 * 1000,
    );
});
