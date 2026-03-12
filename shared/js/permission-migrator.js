// =====================================================
// PERMISSION MIGRATOR - Migration từ checkLogin sang detailedPermissions
// Script-tag compatible (IIFE pattern)
//
// Chuyển đổi hệ thống phân quyền legacy (checkLogin: 0, 1, 777)
// sang hệ thống mới (detailedPermissions) dựa trên PAGES_REGISTRY
//
// Dependencies (global):
//   - window.PAGES_REGISTRY (từ permissions-registry.js)
//   - window.PermissionsRegistry (từ permissions-registry.js)
//   - firebase (Firebase SDK — chỉ cần cho migrateUser/migrateAllUsers)
// =====================================================

(function () {
    'use strict';

    // =====================================================
    // CONSTANTS
    // =====================================================

    /**
     * Mapping checkLogin value → role template ID
     * - 0: Admin — toàn quyền
     * - 1: Staff — xem và chỉnh sửa cơ bản, không admin pages
     * - 777: Guest/Viewer — chỉ xem, không admin pages
     */
    var USERTYPE_TO_TEMPLATE = {
        0: 'admin',
        1: 'staff',
        777: 'viewer'
    };

    var MAX_RETRIES = 3;
    var BASE_DELAY_MS = 1000;

    // =====================================================
    // INTERNAL HELPERS
    // =====================================================

    /**
     * Lấy PAGES_REGISTRY từ window global
     * @returns {Object|null}
     */
    function getPagesRegistry() {
        return (typeof window !== 'undefined' && window.PAGES_REGISTRY) || null;
    }

    /**
     * Lấy PermissionsRegistry helper từ window global
     * @returns {Object|null}
     */
    function getRegistryHelper() {
        return (typeof window !== 'undefined' && window.PermissionsRegistry) || null;
    }

    /**
     * Generate detailedPermissions cho một template ID
     * Ưu tiên dùng PermissionsRegistry.generateTemplatePermissions nếu có,
     * fallback sang logic nội bộ nếu không.
     *
     * @param {string} templateId - 'admin', 'staff', 'viewer', etc.
     * @returns {Object} detailedPermissions object
     */
    function generatePermissionsForTemplate(templateId) {
        // Thử dùng PermissionsRegistry.generateTemplatePermissions trước
        var helper = getRegistryHelper();
        if (helper && typeof helper.generateTemplatePermissions === 'function') {
            var result = helper.generateTemplatePermissions(templateId);
            if (result && result.detailedPermissions) {
                return result.detailedPermissions;
            }
        }

        // Fallback: generate thủ công từ PAGES_REGISTRY
        var registry = getPagesRegistry();
        if (!registry) {
            console.error('[PermissionMigrator] PAGES_REGISTRY not available');
            return {};
        }

        var detailedPermissions = {};
        var pageIds = Object.keys(registry);

        for (var i = 0; i < pageIds.length; i++) {
            var pageId = pageIds[i];
            var page = registry[pageId];
            if (!page || !page.detailedPermissions) continue;

            detailedPermissions[pageId] = {};
            var permKeys = Object.keys(page.detailedPermissions);

            for (var j = 0; j < permKeys.length; j++) {
                var permKey = permKeys[j];

                switch (templateId) {
                    case 'admin':
                        detailedPermissions[pageId][permKey] = true;
                        break;

                    case 'staff':
                        if (page.adminOnly) {
                            detailedPermissions[pageId][permKey] = false;
                        } else {
                            detailedPermissions[pageId][permKey] =
                                permKey === 'view' ||
                                permKey === 'edit' ||
                                permKey === 'update' ||
                                permKey.indexOf('view') === 0;
                        }
                        break;

                    case 'viewer':
                        if (page.adminOnly) {
                            detailedPermissions[pageId][permKey] = false;
                        } else {
                            detailedPermissions[pageId][permKey] =
                                permKey === 'view' ||
                                permKey.indexOf('view') === 0;
                        }
                        break;

                    default:
                        detailedPermissions[pageId][permKey] = false;
                        break;
                }
            }
        }

        return detailedPermissions;
    }

    /**
     * Sleep helper cho retry logic
     * @param {number} ms
     * @returns {Promise}
     */
    function sleep(ms) {
        return new Promise(function (resolve) {
            setTimeout(resolve, ms);
        });
    }

    /**
     * Ghi dữ liệu vào Firebase với retry logic (exponential backoff)
     * @param {string} path - Firebase path (e.g. 'users/userId')
     * @param {Object} data - Dữ liệu cần update
     * @returns {Promise<void>}
     */
    function firebaseUpdateWithRetry(path, data) {
        var attempt = 0;

        function tryWrite() {
            attempt++;
            return firebase.database().ref(path).update(data).catch(function (error) {
                if (attempt >= MAX_RETRIES) {
                    throw new Error(
                        'Firebase write failed after ' + MAX_RETRIES + ' retries at path "' +
                        path + '": ' + error.message
                    );
                }
                var delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
                console.warn(
                    '[PermissionMigrator] Firebase write failed (attempt ' + attempt + '/' +
                    MAX_RETRIES + '), retrying in ' + delay + 'ms...',
                    error.message
                );
                return sleep(delay).then(tryWrite);
            });
        }

        return tryWrite();
    }

    // =====================================================
    // PUBLIC API
    // =====================================================

    var PermissionMigrator = {

        /**
         * Chuyển đổi checkLogin userType sang detailedPermissions
         *
         * @param {number|string} userType - 0 (Admin), 1 (Staff), 777 (Guest), hoặc giá trị khác
         * @returns {Object} { detailedPermissions: Object, roleTemplate: string }
         */
        migrateUserType: function (userType) {
            var numType = parseInt(userType, 10);
            var templateId = USERTYPE_TO_TEMPLATE[numType];

            if (!templateId) {
                console.warn(
                    '[PermissionMigrator] Unknown userType "' + userType +
                    '", defaulting to viewer template'
                );
                templateId = 'viewer';
            }

            var detailedPermissions = generatePermissionsForTemplate(templateId);

            return {
                detailedPermissions: detailedPermissions,
                roleTemplate: templateId
            };
        },

        /**
         * Kiểm tra user có cần migration không
         * User cần migration nếu:
         *   - Có userType (checkLogin data)
         *   - CHƯA có detailedPermissions
         *
         * @param {Object} userData - Dữ liệu user từ Firebase
         * @returns {boolean} true nếu cần migration
         */
        needsMigration: function (userData) {
            if (!userData || typeof userData !== 'object') {
                return false;
            }

            // Không có userType → không phải legacy user, skip
            if (userData.userType === undefined && userData.checkLogin === undefined) {
                return false;
            }

            // Đã có detailedPermissions → không cần migration
            if (userData.detailedPermissions &&
                typeof userData.detailedPermissions === 'object' &&
                Object.keys(userData.detailedPermissions).length > 0) {
                return false;
            }

            return true;
        },

        /**
         * Thực hiện migration cho một user (in-memory, không ghi Firebase)
         * Trả về userData mới với detailedPermissions và roleTemplate
         *
         * @param {Object} userData - Dữ liệu user từ Firebase
         * @returns {Object} userData đã được cập nhật (hoặc nguyên bản nếu không cần migration)
         */
        migrateUser: function (userData) {
            if (!this.needsMigration(userData)) {
                return userData;
            }

            // Lấy userType từ userData — hỗ trợ cả userType và checkLogin property
            var userType = userData.userType !== undefined
                ? userData.userType
                : userData.checkLogin;

            if (userType === undefined || userType === null) {
                console.warn('[PermissionMigrator] User has no userType or checkLogin, skipping');
                return userData;
            }

            var migrationResult = this.migrateUserType(userType);

            // Tạo bản copy với permissions mới (không mutate original)
            var updatedUser = {};
            var keys = Object.keys(userData);
            for (var i = 0; i < keys.length; i++) {
                updatedUser[keys[i]] = userData[keys[i]];
            }
            updatedUser.detailedPermissions = migrationResult.detailedPermissions;
            updatedUser.roleTemplate = migrationResult.roleTemplate;

            return updatedUser;
        },

        /**
         * Batch migrate tất cả users trong Firebase
         * Đọc tất cả users, migrate những user cần thiết, ghi lại vào Firebase
         *
         * @returns {Promise<{migrated: number, skipped: number, errors: string[]}>}
         */
        migrateAllUsers: function () {
            var self = this;

            // Kiểm tra Firebase SDK
            if (typeof firebase === 'undefined' || !firebase.database) {
                return Promise.reject(new Error(
                    '[PermissionMigrator] Firebase SDK not available'
                ));
            }

            // Kiểm tra PAGES_REGISTRY
            if (!getPagesRegistry()) {
                return Promise.reject(new Error(
                    '[PermissionMigrator] PAGES_REGISTRY not loaded'
                ));
            }

            var result = {
                migrated: 0,
                skipped: 0,
                errors: []
            };

            console.log('[PermissionMigrator] Starting batch migration...');

            return firebase.database().ref('users').once('value')
                .then(function (snapshot) {
                    var usersData = snapshot.val();
                    if (!usersData) {
                        console.log('[PermissionMigrator] No users found');
                        return result;
                    }

                    var userIds = Object.keys(usersData);
                    console.log('[PermissionMigrator] Found ' + userIds.length + ' users to process');

                    // Xử lý tuần tự từng user để tránh quá tải Firebase
                    var index = 0;

                    function processNext() {
                        if (index >= userIds.length) {
                            return Promise.resolve();
                        }

                        var userId = userIds[index];
                        var userData = usersData[userId];
                        index++;

                        if (!self.needsMigration(userData)) {
                            result.skipped++;
                            return processNext();
                        }

                        var migrated = self.migrateUser(userData);

                        var updateData = {
                            detailedPermissions: migrated.detailedPermissions,
                            roleTemplate: migrated.roleTemplate
                        };

                        return firebaseUpdateWithRetry('users/' + userId, updateData)
                            .then(function () {
                                result.migrated++;
                                console.log(
                                    '[PermissionMigrator] Migrated user "' + userId +
                                    '" (userType: ' + (userData.userType || userData.checkLogin) +
                                    ' → ' + migrated.roleTemplate + ')'
                                );
                                return processNext();
                            })
                            .catch(function (error) {
                                result.errors.push(
                                    'User "' + userId + '": ' + error.message
                                );
                                console.error(
                                    '[PermissionMigrator] Failed to migrate user "' + userId + '":',
                                    error.message
                                );
                                return processNext();
                            });
                    }

                    return processNext().then(function () {
                        return result;
                    });
                })
                .then(function (finalResult) {
                    console.log(
                        '[PermissionMigrator] Batch migration complete — ' +
                        'Migrated: ' + finalResult.migrated +
                        ', Skipped: ' + finalResult.skipped +
                        ', Errors: ' + finalResult.errors.length
                    );
                    return finalResult;
                });
        }
    };

    // =====================================================
    // EXPORTS
    // =====================================================

    if (typeof window !== 'undefined') {
        window.PermissionMigrator = PermissionMigrator;
    }

    // Support ES module import nếu cần
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = PermissionMigrator;
    }

    console.log('[PermissionMigrator] Loaded — Ready to migrate checkLogin → detailedPermissions');

})();
