// =====================================================
// MIGRATION SCRIPT: Update Admin Users with isAdmin Flag
//
// PURPOSE: Migrate admin users to use isAdmin flag for bypass
// - Adds isAdmin: true to admin user documents
// - Keeps detailedPermissions for rollback
// - Uses PAGES_REGISTRY as Single Source of Truth
//
// USAGE:
// 1. Mở trang User Management
// 2. Đợi Firebase kết nối (thấy "Kết nối Firebase thành công")
// 3. Mở Console (F12) và chạy: await migrateAdminUsers()
// =====================================================

// Firebase config - use shared config if available (loaded via shared/js/firebase-config.js)
// Use window scope to avoid redeclaration errors
if (!window._MIGRATION_FIREBASE_CONFIG) {
    window._MIGRATION_FIREBASE_CONFIG = (typeof FIREBASE_CONFIG !== 'undefined') ? FIREBASE_CONFIG : {
        apiKey: "AIzaSyA-legWlCgjMDEy70rsaTTwLK39F4ZCKhM",
        authDomain: "n2shop-69e37.firebaseapp.com",
        projectId: "n2shop-69e37",
        storageBucket: "n2shop-69e37-ne0q1",
        messagingSenderId: "598906493303",
        appId: "1:598906493303:web:46d6236a1fdc2eff33e972",
    };
}

/**
 * Ensure Firebase is connected
 */
window.ensureFirebaseConnected = async function() {
    // Check if already connected
    if (window.db) {
        console.log("[Migration] Firebase already connected");
        return true;
    }

    console.log("[Migration] Initializing Firebase...");

    try {
        // Check if firebase is loaded
        if (typeof firebase === 'undefined') {
            console.error("[Migration] Firebase SDK not loaded!");
            return false;
        }

        // Initialize if not already
        if (!firebase.apps.length) {
            firebase.initializeApp(window._MIGRATION_FIREBASE_CONFIG);
        }

        // Set global db reference
        window.db = firebase.firestore();
        console.log("[Migration] Firebase connected successfully!");
        return true;
    } catch (error) {
        console.error("[Migration] Firebase connection error:", error);
        return false;
    }
};

/**
 * Generate full detailedPermissions object with all permissions = true
 * Uses PAGES_REGISTRY as Single Source of Truth
 */
window.generateFullAdminPermissions = function() {
    // Use PAGES_REGISTRY if available (Single Source of Truth)
    if (typeof PermissionsRegistry !== 'undefined' && typeof PermissionsRegistry.generateFullDetailedPermissions === 'function') {
        return PermissionsRegistry.generateFullDetailedPermissions();
    }
    // Fallback: empty object if PAGES_REGISTRY not loaded
    console.warn('[Migration] PermissionsRegistry not available, returning empty permissions');
    return {};
};

/**
 * Count total permissions
 */
window.countPermissions = function(perms) {
    let count = 0;
    Object.values(perms).forEach(pagePerms => {
        count += Object.values(pagePerms).filter(v => v === true).length;
    });
    return count;
};

/**
 * Update the current user's local auth data to reflect admin status.
 * Solves the chicken-and-egg problem: after Firestore migration, local
 * storage still has stale auth data without isAdmin flag.
 */
window.updateLocalAuthAsAdmin = function() {
    const AUTH_KEY = "loginindex_auth";
    let source = null;
    let raw = null;

    // Try localStorage first, then sessionStorage
    raw = localStorage.getItem(AUTH_KEY);
    if (raw) {
        source = "localStorage";
    } else {
        raw = sessionStorage.getItem(AUTH_KEY);
        if (raw) {
            source = "sessionStorage";
        }
    }

    if (!raw || !source) {
        console.warn("[Migration] No auth data found in localStorage or sessionStorage under key:", AUTH_KEY);
        return null;
    }

    try {
        const authData = JSON.parse(raw);
        authData.isAdmin = true;
        authData.roleTemplate = 'admin';

        const updated = JSON.stringify(authData);
        if (source === "localStorage") {
            localStorage.setItem(AUTH_KEY, updated);
        } else {
            sessionStorage.setItem(AUTH_KEY, updated);
        }

        console.log(`[Migration] ✅ Local auth updated in ${source}: isAdmin=true, roleTemplate='admin'`);
        return authData;
    } catch (error) {
        console.error("[Migration] Failed to update local auth data:", error);
        return null;
    }
};

/**
 * Migrate all admin users to have full detailedPermissions
 */
window.migrateAdminUsers = async function() {
    console.log("========================================");
    console.log("MIGRATION: Admin Full Permissions");
    console.log("========================================");

    // Auto-connect Firebase if needed
    const connected = await window.ensureFirebaseConnected();
    if (!connected) {
        console.error("Firebase not connected!");
        alert("Firebase not connected! Vui lòng đợi trang load xong hoặc refresh lại.");
        return { success: false, error: "Firebase not connected" };
    }

    const fullPermissions = window.generateFullAdminPermissions();
    const totalPerms = window.countPermissions(fullPermissions);
    console.log(`Full permissions object has ${totalPerms} permissions`);

    try {
        // Get all users
        const usersSnapshot = await window.db.collection("users").get();
        const users = [];
        usersSnapshot.forEach(doc => {
            users.push({ id: doc.id, ...doc.data() });
        });

        console.log(`Found ${users.length} users`);

        // Find admin users (roleTemplate='admin' OR checkLogin=0)
        const adminUsers = users.filter(user =>
            user.roleTemplate === 'admin' ||
            user.checkLogin === 0 ||
            user.checkLogin === "0"
        );

        console.log(`Found ${adminUsers.length} admin users to migrate`);

        if (adminUsers.length === 0) {
            console.log("No admin users found to migrate");
            return { success: true, migrated: 0, users: [] };
        }

        const results = [];
        const batch = window.db.batch();

        for (const user of adminUsers) {
            console.log(`Processing: ${user.id} (${user.displayName})`);

            const userRef = window.db.collection("users").doc(user.id);

            // Update user with full permissions and admin template
            batch.update(userRef, {
                isAdmin: true,  // NEW: Admin flag for bypass
                roleTemplate: 'admin',  // Kept for backward compatible
                detailedPermissions: fullPermissions,  // Kept for rollback
                migrationNote: `Migrated to isAdmin flag on ${new Date().toISOString()}`,
                lastModified: new Date().toISOString()
            });

            results.push({
                id: user.id,
                displayName: user.displayName,
                previousRoleTemplate: user.roleTemplate,
                previousCheckLogin: user.checkLogin,
                newPermissionCount: totalPerms
            });
        }

        // Commit batch
        await batch.commit();

        // Update current user's local auth data so admin toggle works immediately
        window.updateLocalAuthAsAdmin();

        console.log("========================================");
        console.log("MIGRATION COMPLETE!");
        console.log(`Migrated ${results.length} admin users`);
        console.log("========================================");

        // Log results
        results.forEach(r => {
            console.log(`  - ${r.id}: ${r.displayName} (${r.newPermissionCount} permissions)`);
        });

        return { success: true, migrated: results.length, users: results };

    } catch (error) {
        console.error("Migration error:", error);
        return { success: false, error: error.message };
    }
};

/**
 * Preview which users will be migrated (dry run)
 */
window.previewMigration = async function() {
    console.log("========================================");
    console.log("PREVIEW: Admin Migration (Dry Run)");
    console.log("========================================");

    // Auto-connect Firebase if needed
    const connected = await window.ensureFirebaseConnected();
    if (!connected) {
        console.error("Firebase not connected!");
        return null;
    }

    try {
        const usersSnapshot = await window.db.collection("users").get();
        const users = [];
        usersSnapshot.forEach(doc => {
            users.push({ id: doc.id, ...doc.data() });
        });

        // Find admin users
        const adminUsers = users.filter(user =>
            user.roleTemplate === 'admin' ||
            user.checkLogin === 0 ||
            user.checkLogin === "0"
        );

        console.log(`Total users: ${users.length}`);
        console.log(`Admin users to migrate: ${adminUsers.length}`);
        console.log("");

        adminUsers.forEach(user => {
            const currentPerms = user.detailedPermissions ? window.countPermissions(user.detailedPermissions) : 0;
            console.log(`  ${user.id}:`);
            console.log(`    - Display Name: ${user.displayName}`);
            console.log(`    - roleTemplate: ${user.roleTemplate || 'N/A'}`);
            console.log(`    - checkLogin: ${user.checkLogin}`);
            console.log(`    - Current permissions: ${currentPerms}`);
            console.log(`    - Will have: ${window.countPermissions(window.generateFullAdminPermissions())} permissions`);
        });

        return adminUsers;
    } catch (error) {
        console.error("Preview error:", error);
    }
};

/**
 * Migrate a single user by username
 */
window.migrateSingleUser = async function(username) {
    console.log(`Migrating single user: ${username}`);

    // Auto-connect Firebase if needed
    const connected = await window.ensureFirebaseConnected();
    if (!connected) {
        console.error("Firebase not connected!");
        return { success: false, error: "Firebase not connected" };
    }

    const fullPermissions = window.generateFullAdminPermissions();

    try {
        const userRef = window.db.collection("users").doc(username);
        const userDoc = await userRef.get();

        if (!userDoc.exists) {
            console.error(`User ${username} not found!`);
            return { success: false, error: "User not found" };
        }

        await userRef.update({
            isAdmin: true,  // NEW: Admin flag for bypass
            roleTemplate: 'admin',
            detailedPermissions: fullPermissions,  // Kept for rollback
            migrationNote: `Migrated to isAdmin flag on ${new Date().toISOString()}`,
            lastModified: new Date().toISOString()
        });

        console.log(`Successfully migrated ${username} with ${window.countPermissions(fullPermissions)} permissions`);
        return { success: true, username, permissionCount: window.countPermissions(fullPermissions) };

    } catch (error) {
        console.error("Migration error:", error);
        return { success: false, error: error.message };
    }
};

// Script loaded message
console.log("========================================");
console.log("Admin Migration Script Loaded");
console.log("========================================");
console.log("Available functions:");
console.log("  - previewMigration() : Preview users to migrate");
console.log("  - migrateAdminUsers() : Migrate all admin users");
console.log("  - migrateSingleUser('username') : Migrate single user");
console.log("  - generateFullAdminPermissions() : Get full permissions object");
console.log("  - updateLocalAuthAsAdmin() : Update local auth data with admin flag");
console.log("========================================");
