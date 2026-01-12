// =====================================================
// PERMISSIONS MIGRATION SCRIPT
// Migrate từ pagePermissions sang detailedPermissions only
// Chạy 1 lần để cập nhật tất cả users trong Firebase
// =====================================================

/**
 * PermissionsMigration - Tool để migrate user permissions
 *
 * Sử dụng:
 * 1. Mở trang user-management
 * 2. Mở Console (F12)
 * 3. Chạy: await PermissionsMigration.preview() để xem trước
 * 4. Chạy: await PermissionsMigration.execute() để thực hiện migration
 */
const PermissionsMigration = {

    /**
     * Tạo full permissions object cho tất cả pages
     * @returns {Object} detailedPermissions với tất cả quyền = true
     */
    generateFullPermissions() {
        if (typeof PAGES_REGISTRY === 'undefined') {
            console.error('[Migration] PAGES_REGISTRY not found!');
            return {};
        }

        const fullPerms = {};

        Object.entries(PAGES_REGISTRY).forEach(([pageId, page]) => {
            fullPerms[pageId] = {};

            if (page.detailedPermissions) {
                Object.keys(page.detailedPermissions).forEach(permKey => {
                    fullPerms[pageId][permKey] = true;
                });
            }
        });

        return fullPerms;
    },

    /**
     * Preview migration - Xem trước thay đổi mà không lưu
     */
    async preview() {
        console.log('='.repeat(60));
        console.log('[Migration] PREVIEW MODE - Không lưu thay đổi');
        console.log('='.repeat(60));

        if (typeof db === 'undefined' || !db) {
            console.error('[Migration] Firebase chưa kết nối!');
            return;
        }

        try {
            const snapshot = await db.collection('users').get();
            const users = [];
            snapshot.forEach(doc => {
                users.push({ id: doc.id, ...doc.data() });
            });

            console.log(`[Migration] Tìm thấy ${users.length} users`);
            console.log('');

            const fullPerms = this.generateFullPermissions();
            const totalPermsCount = Object.values(fullPerms).reduce(
                (sum, page) => sum + Object.keys(page).length, 0
            );

            console.log(`[Migration] Full permissions: ${Object.keys(fullPerms).length} pages, ${totalPermsCount} quyền`);
            console.log('');

            users.forEach((user, index) => {
                const currentPagePerms = user.pagePermissions || [];
                const currentDetailedPerms = user.detailedPermissions || {};
                const currentDetailedCount = Object.values(currentDetailedPerms).reduce(
                    (sum, page) => sum + Object.values(page).filter(v => v === true).length, 0
                );

                console.log(`${index + 1}. ${user.displayName || user.id}`);
                console.log(`   - ID: ${user.id}`);
                console.log(`   - Role: checkLogin=${user.checkLogin}`);
                console.log(`   - Hiện tại: ${currentPagePerms.length} pages, ${currentDetailedCount} detailed perms`);
                console.log(`   - Sau migration: ${Object.keys(fullPerms).length} pages, ${totalPermsCount} detailed perms (FULL)`);
                console.log('');
            });

            console.log('='.repeat(60));
            console.log('[Migration] Để thực hiện migration, chạy:');
            console.log('   await PermissionsMigration.execute()');
            console.log('='.repeat(60));

            return { users, fullPerms };

        } catch (error) {
            console.error('[Migration] Lỗi:', error);
        }
    },

    /**
     * Execute migration - Thực hiện migration và lưu vào Firebase
     */
    async execute() {
        console.log('='.repeat(60));
        console.log('[Migration] EXECUTING - Đang cập nhật Firebase...');
        console.log('='.repeat(60));

        if (typeof db === 'undefined' || !db) {
            console.error('[Migration] Firebase chưa kết nối!');
            return { success: false, error: 'Firebase not connected' };
        }

        try {
            const snapshot = await db.collection('users').get();
            const users = [];
            snapshot.forEach(doc => {
                users.push({ id: doc.id, ...doc.data() });
            });

            const fullPerms = this.generateFullPermissions();
            const results = {
                total: users.length,
                success: 0,
                failed: 0,
                errors: []
            };

            console.log(`[Migration] Bắt đầu migrate ${users.length} users...`);
            console.log('');

            for (const user of users) {
                try {
                    // Detect roleTemplate based on existing permissions or assign 'admin' for full perms
                    const roleTemplate = user.roleTemplate || 'admin'; // Default to admin for migration

                    // Cập nhật user với full detailedPermissions và roleTemplate
                    await db.collection('users').doc(user.id).update({
                        detailedPermissions: fullPerms,
                        roleTemplate: roleTemplate, // NEW: Add roleTemplate
                    });

                    results.success++;
                    console.log(`✅ ${user.displayName || user.id} - OK (roleTemplate: ${roleTemplate})`);

                } catch (error) {
                    results.failed++;
                    results.errors.push({ user: user.id, error: error.message });
                    console.error(`❌ ${user.displayName || user.id} - FAILED:`, error.message);
                }
            }

            console.log('');
            console.log('='.repeat(60));
            console.log('[Migration] KẾT QUẢ:');
            console.log(`   - Tổng: ${results.total}`);
            console.log(`   - Thành công: ${results.success}`);
            console.log(`   - Thất bại: ${results.failed}`);
            console.log('='.repeat(60));

            if (results.failed === 0) {
                console.log('');
                console.log('🎉 Migration hoàn tất thành công!');
                console.log('   Tất cả users đã có FULL quyền cho tất cả pages.');
                console.log('   Bạn có thể điều chỉnh quyền cho từng user trong UI.');
            }

            return results;

        } catch (error) {
            console.error('[Migration] Lỗi nghiêm trọng:', error);
            return { success: false, error: error.message };
        }
    },

    /**
     * Rollback - Xóa detailedPermissions (nếu cần)
     * CHÚ Ý: Chỉ dùng khi cần rollback!
     */
    async rollback() {
        console.warn('[Migration] ROLLBACK - Xóa tất cả detailedPermissions!');

        const confirm = window.confirm(
            'BẠN CÓ CHẮC MUỐN XÓA TẤT CẢ DETAILED PERMISSIONS?\n\n' +
            'Hành động này không thể hoàn tác!'
        );

        if (!confirm) {
            console.log('[Migration] Rollback đã hủy.');
            return;
        }

        try {
            const snapshot = await db.collection('users').get();

            for (const doc of snapshot.docs) {
                await db.collection('users').doc(doc.id).update({
                    detailedPermissions: firebase.firestore.FieldValue.delete()
                });
                console.log(`Cleared: ${doc.id}`);
            }

            console.log('[Migration] Rollback hoàn tất.');

        } catch (error) {
            console.error('[Migration] Rollback failed:', error);
        }
    },

    /**
     * Add roleTemplate to existing users that already have detailedPermissions
     * Detects template based on permission patterns
     */
    async addRoleTemplate() {
        console.log('='.repeat(60));
        console.log('[Migration] Adding roleTemplate to existing users...');
        console.log('='.repeat(60));

        if (typeof db === 'undefined' || !db) {
            console.error('[Migration] Firebase chưa kết nối!');
            return { success: false, error: 'Firebase not connected' };
        }

        try {
            const snapshot = await db.collection('users').get();
            const results = { total: 0, updated: 0, skipped: 0, errors: [] };

            for (const doc of snapshot.docs) {
                results.total++;
                const user = doc.data();

                // Skip if already has roleTemplate
                if (user.roleTemplate) {
                    console.log(`⏭️ ${user.displayName || doc.id} - already has roleTemplate: ${user.roleTemplate}`);
                    results.skipped++;
                    continue;
                }

                // Detect roleTemplate based on permissions
                const roleTemplate = this.detectRoleTemplate(user.detailedPermissions);

                try {
                    await db.collection('users').doc(doc.id).update({
                        roleTemplate: roleTemplate
                    });
                    console.log(`✅ ${user.displayName || doc.id} - added roleTemplate: ${roleTemplate}`);
                    results.updated++;
                } catch (error) {
                    console.error(`❌ ${user.displayName || doc.id} - FAILED:`, error.message);
                    results.errors.push({ user: doc.id, error: error.message });
                }
            }

            console.log('');
            console.log('='.repeat(60));
            console.log('[Migration] KẾT QUẢ:');
            console.log(`   - Tổng: ${results.total}`);
            console.log(`   - Updated: ${results.updated}`);
            console.log(`   - Skipped: ${results.skipped}`);
            console.log(`   - Errors: ${results.errors.length}`);
            console.log('='.repeat(60));

            return results;
        } catch (error) {
            console.error('[Migration] Error:', error);
            return { success: false, error: error.message };
        }
    },

    /**
     * Detect roleTemplate based on permission patterns
     */
    detectRoleTemplate(detailedPermissions) {
        if (!detailedPermissions) return 'custom';

        // Count permissions
        let grantedCount = 0;
        let totalCount = 0;

        Object.values(detailedPermissions).forEach(pagePerms => {
            Object.values(pagePerms).forEach(value => {
                totalCount++;
                if (value === true) grantedCount++;
            });
        });

        // If all permissions are true, it's admin
        if (grantedCount === totalCount && totalCount > 0) {
            return 'admin';
        }

        // If no permissions, it's viewer
        if (grantedCount === 0) {
            return 'viewer';
        }

        // Otherwise custom
        return 'custom';
    }
};

// Export to window for console access
window.PermissionsMigration = PermissionsMigration;

console.log('[Permissions Migration] Loaded. Commands:');
console.log('  - PermissionsMigration.preview()       : Xem trước migration');
console.log('  - PermissionsMigration.execute()       : Thực hiện migration (full perms)');
console.log('  - PermissionsMigration.addRoleTemplate() : Thêm roleTemplate cho users hiện có');
