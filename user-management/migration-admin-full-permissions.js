// =====================================================
// MIGRATION SCRIPT: Update Admin Users with Full detailedPermissions
//
// PURPOSE: Migrate from admin bypass system to unified detailedPermissions
// - All users (including Admin) now use detailedPermissions
// - Admin template = all permissions set to true
// - NO bypass based on roleTemplate
//
// USAGE:
// 1. Mở trang User Management
// 2. Đợi Firebase kết nối (thấy "Kết nối Firebase thành công")
// 3. Mở Console (F12) và chạy: await migrateAdminUsers()
// =====================================================

// Firebase config (same as user-management-enhanced.js)
// Use window scope to avoid redeclaration errors
if (!window._MIGRATION_FIREBASE_CONFIG) {
    window._MIGRATION_FIREBASE_CONFIG = {
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
 * Based on PAGES_REGISTRY
 */
window.generateFullAdminPermissions = function() {
    // All pages and their permissions
    const fullPermissions = {
        // SALES
        live: {
            view: true,
            upload: true,
            edit: true,
            delete: true
        },
        livestream: {
            view: true,
            export: true,
            edit: true,
            analytics: true
        },
        sanphamlive: {
            view: true,
            add: true,
            edit: true,
            delete: true,
            pricing: true,
            stock: true
        },
        ib: {
            view: true,
            reply: true,
            assign: true,
            archive: true,
            export: true,
            delete: true
        },

        // WAREHOUSE
        nhanhang: {
            view: true,
            create: true,
            confirm: true,
            edit: true,
            cancel: true,
            weigh: true,
            delete: true
        },
        inventoryTracking: {
            tab_tracking: true,
            tab_congNo: true,
            create_shipment: true,
            edit_shipment: true,
            delete_shipment: true,
            view_chiPhiHangVe: true,
            edit_chiPhiHangVe: true,
            view_ghiChuAdmin: true,
            edit_ghiChuAdmin: true,
            edit_soMonThieu: true,
            create_prepayment: true,
            edit_prepayment: true,
            delete_prepayment: true,
            create_otherExpense: true,
            edit_otherExpense: true,
            delete_otherExpense: true,
            edit_invoice_from_finance: true,
            edit_shipping_from_finance: true,
            export_data: true
        },
        "purchase-orders": {
            view: true,
            create: true,
            edit: true,
            delete: true,
            status_change: true,
            copy: true,
            export: true,
            upload_images: true
        },
        hangrotxa: {
            view: true,
            mark: true,
            approve: true,
            price: true,
            delete: true
        },
        hanghoan: {
            view: true,
            approve: true,
            reject: true,
            refund: true,
            update: true,
            export: true
        },
        "product-search": {
            view: true,
            viewStock: true,
            viewPrice: true,
            export: true
        },
        "soluong-live": {
            view: true,
            edit: true,
            adjust: true,
            export: true
        },

        // ORDERS
        ck: {
            view: true,
            verify: true,
            edit: true,
            export: true,
            delete: true
        },
        "order-management": {
            view: true,
            create: true,
            edit: true,
            updateStatus: true,
            cancel: true,
            export: true,
            print: true
        },
        "order-log": {
            view: true,
            add: true,
            edit: true,
            delete: true,
            export: true
        },
        "order-live-tracking": {
            view: true,
            track: true,
            update: true,
            export: true
        },

        // REPORTS
        baocaosaleonline: {
            view: true,
            viewRevenue: true,
            viewDetails: true,
            export: true,
            compare: true
        },
        "tpos-pancake": {
            view: true,
            sync: true,
            import: true,
            export: true,
            configure: true
        },

        // ADMIN
        "user-management": {
            view: true,
            create: true,
            edit: true,
            delete: true,
            permissions: true,
            resetPassword: true,
            manageTemplates: true
        },
        "balance-history": {
            view: true,
            viewDetails: true,
            export: true,
            adjust: true
        },
        "customer-management": {
            view: true,
            add: true,
            edit: true,
            delete: true,
            export: true,
            viewHistory: true
        },
        "invoice-compare": {
            view: true,
            compare: true,
            import: true,
            export: true,
            resolve: true
        },
        lichsuchinhsua: {
            view: true,
            viewDetails: true,
            export: true,
            restore: true,
            delete: true
        }
    };

    return fullPermissions;
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
                roleTemplate: 'admin',
                detailedPermissions: fullPermissions,
                migrationNote: `Migrated to full detailedPermissions on ${new Date().toISOString()}`,
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
            roleTemplate: 'admin',
            detailedPermissions: fullPermissions,
            migrationNote: `Migrated to full detailedPermissions on ${new Date().toISOString()}`,
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
console.log("========================================");
