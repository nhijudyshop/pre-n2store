# Changelog - N2Store Optimization

Tất cả thay đổi trong quá trình tối ưu hóa dự án được ghi lại tại đây.

Format: [YYYY-MM-DD] Mô tả thay đổi
- **Phạm vi:** Module/file bị ảnh hưởng
- **Loại:** restructure | migration | optimization | cleanup
- **Mô tả:** Chi tiết thay đổi
- **Rollback:** `git revert <commit-hash>`

---

## [2026-02-22] Hoàn tất Vite config cho multi-page build (Task 11.1)
- **Phạm vi:** vite.config.js
- **Loại:** optimization
- **Mô tả:**
  - Cập nhật EXCLUDED_DIRS để loại trừ chính xác các thư mục không phải module (node_modules, dist, docs, tests, .git, .github, build-scripts, scripts, cloudflare-worker, firebase-functions, render.com, AI, .claude)
  - Loại bỏ manualChunks rỗng, để Vite tự xử lý code splitting
  - Xác nhận tree-shaking hoạt động, source maps chỉ ở development
- **Rollback:** `git revert <commit-hash>`

## [2026-02-22] Thiết lập CI/CD Pipeline (Task 10)
- **Phạm vi:** .github/workflows/ci.yml, .github/workflows/deploy.yml
- **Loại:** setup
- **Mô tả:**
  - Tạo `ci.yml`: PR checks tự động — checkout, setup Node 20, install, lint, test, build
  - Tạo `deploy.yml`: Auto deploy khi push to main — build, deploy Firebase Hosting, deploy Cloudflare Worker (nếu có thay đổi), notify team
  - Xử lý lỗi: deploy fail → giữ version hiện tại, notify team
- **Rollback:** `git revert <commit-hash>`

## [2026-02-22] Tổ chức lại tài liệu vào /docs/ (Task 9.2)
- **Phạm vi:** 44 file .md và .txt tại root → docs/
- **Loại:** restructure
- **Mô tả:**
  - Tạo cấu trúc: docs/architecture/, docs/guides/, docs/api-docs/, docs/plans/, docs/legacy/
  - Di chuyển 44 file tài liệu từ root vào /docs/ theo phân loại
  - Giữ README.md tại root, cập nhật nội dung tổng quan
  - KHÔNG xóa bất kỳ file .md hay .txt nào — chỉ di chuyển
- **Rollback:** `git revert <commit-hash>`

## [2026-02-22] Xóa 4 module không còn sử dụng (Task 9.1)
- **Phạm vi:** sanphamlive/, order-live-tracking/, livestream/, link transaction/
- **Loại:** cleanup
- **Mô tả:**
  - Xóa 4 module không còn sử dụng: sanphamlive, order-live-tracking, livestream, link transaction
  - Xóa entries trong PAGES_REGISTRY (permissions-registry.js)
  - Xóa entries trong AVAILABLE_PAGES và PERMISSION_TEMPLATES (user-permission-page.js)
  - Xóa entries trong DETAILED_PERMISSIONS (detailed-permissions-config.js)
  - Xóa entries trong migration-admin-full-permissions.js
  - Xóa navigation items và group references trong navigation-modern.js
  - Xóa references trong ai-chat-widget.js và build-scripts/add-core-loader.sh
  - Cập nhật comment trong firebase-config.js
  - Regenerated tất cả .min.js files
  - Modules live/ và soluong-live/ KHÔNG bị ảnh hưởng
  - Giữ lại sanphamlive_cache trong storage-migration.js (cần cho data migration)
- **Rollback:** `git revert <commit-hash>`

## [2026-02-22] Migrate InvoiceStatusStore và InvoiceStatusDeleteStore sang BaseStore (Task 7.2)
- **Phạm vi:** orders-report/js/tab1/tab1-fast-sale-invoice-status.js
- **Loại:** optimization
- **Mô tả:**
  - Refactor InvoiceStatusStore và InvoiceStatusDeleteStore để sử dụng BaseStore
  - Tạo instance từ BaseStore với config phù hợp (collectionPath, localStorageKey, maxLocalAge)
  - Giữ nguyên behavior hiện tại, chỉ thay đổi cấu trúc internal
- **Rollback:** `git revert <commit-hash>`

## [2026-02-22] Tạo BaseStore class cho state management (Task 7.1)
- **Phạm vi:** shared/js/base-store.js
- **Loại:** optimization
- **Mô tả:**
  - Tạo class BaseStore với pattern "Firebase as Source of Truth + Real-time Listener"
  - Implement: load() (Firestore + fallback localStorage), setupRealtimeListener(), _saveToLocal(), _loadFromLocal(), _cleanupOldEntries(), subscribe(callback), destroy()
  - Xử lý lỗi: Firestore fail → fallback localStorage, localStorage đầy → cleanup, data corruption → fetch fresh, listener ngắt → auto-reconnect
  - Firestore luôn ưu tiên khi có xung đột
- **Rollback:** `git revert <commit-hash>`

## [2026-02-22] Tạo ModuleLoader cho lazy loading (Task 6.2)
- **Phạm vi:** shared/js/module-loader.js
- **Loại:** optimization
- **Mô tả:**
  - Tạo ModuleLoader với hàm load(modulePath) (dynamic import) và preload(modulePaths) (requestIdleCallback + modulepreload)
  - Hỗ trợ lazy loading modules không cần thiết cho hiển thị ban đầu
- **Rollback:** `git revert <commit-hash>`

## [2026-02-22] Viết lại Service Worker với cache strategies (Task 6.1)
- **Phạm vi:** service-worker.js
- **Loại:** optimization
- **Mô tả:**
  - Sửa cache paths: bao gồm cả /shared/js/ và /shared/browser/
  - Implement 3 chiến lược cache: stale-while-revalidate (static assets), network-first (API calls, timeout 5s), cache-first (CDN, 7 ngày)
  - Xử lý lỗi: cache storage đầy → xóa cache cũ nhất, network timeout → fallback cache, asset không tồn tại → log warning
- **Rollback:** `git revert <commit-hash>`

## [2026-02-22] Loại bỏ Firebase config trùng lặp trong tất cả modules (Task 5.1, 5.2)
- **Phạm vi:** soluong-live, orders-report, order-management, user-management, nhanhang, live, ib, hangrotxa, ck, bangkiemhang, firebase-stats, purchase-orders, inventory-tracking, hanghoan, index (login), tpos-pancake, soorder
- **Loại:** cleanup
- **Mô tả:**
  - Thêm `shared/js/firebase-config.js` vào tất cả HTML pages chưa load shared config
  - Xóa hardcoded Firebase config trong JS files, thay bằng reference đến shared config
  - Giữ fallback pattern cho các module có config mixed với module-specific settings
  - Xóa hoàn toàn inline config trong 20+ files
  - Xóa file config cục bộ: tpos-pancake/js/config.js, soorder/js/soorder-config.js
  - Tạo module template chuẩn tại docs/guides/module-template.md
- **Rollback:** `git revert <commit-hash>`

## [2026-02-22] Xóa code checkLogin legacy (Task 3.4)
- **Phạm vi:** shared/browser/auth-manager.js, shared/js/shared-auth-manager.js
- **Loại:** cleanup
- **Mô tả:**
  - Xóa deprecated methods: getPermissionLevel(), hasPermissionLevel(), hasPermission(requiredLevel)
  - Xóa AUTH_CONFIG.PERMISSION_LEVELS constant
  - Xóa getRoleInfo() method
  - Xác minh không còn reference nào đến checkLogin, getPermissionLevel, hasPermissionLevel trong codebase
- **Rollback:** `git revert <commit-hash>`

## [2026-02-22] Migrate 12+ module legacy sang detailedPermissions (Task 3.3)
- **Phạm vi:** nhanhang, hangrotxa, ib, ck, bangkiemhang, hanghoan, shared/browser/auth-manager.js, shared/js/shared-auth-manager.js
- **Loại:** migration
- **Mô tả:**
  - Thay thế các so sánh auth.checkLogin và auth.userType bằng PermissionHelper.canAccessPage(pageId) / PermissionHelper.hasPermission(pageId, action)
  - Thêm PermissionHelper.enforcePageAccess(pageId) ở đầu mỗi trang
  - Thêm PermissionHelper.applyUIRestrictions(pageId) cho UI elements
  - Commit riêng biệt cho mỗi module
- **Rollback:** `git revert <commit-hash>`

## [2026-02-22] Tạo PermissionMigrator module (Task 3.1)
- **Phạm vi:** shared/js/permission-migrator.js
- **Loại:** migration
- **Mô tả:**
  - Tạo PermissionMigrator với các hàm: migrateUserType(), needsMigration(), migrateUser(), migrateAllUsers()
  - Mapping: 0 → Admin (tất cả true), 1 → Staff (theo PERMISSION_TEMPLATES['staff']), 777 → Guest (theo PERMISSION_TEMPLATES['viewer'])
  - Xử lý lỗi: skip user không có userType, map userType không hợp lệ sang 'viewer', retry 3 lần khi Firebase write fail
- **Rollback:** `git revert <commit-hash>`

## [2026-02-22] Khởi tạo quá trình tối ưu hóa (Task 1)
- **Phạm vi:** Toàn bộ dự án
- **Loại:** setup
- **Mô tả:**
  - Tạo backup branch `backup/pre-optimization` từ main
  - Tạo CHANGELOG.md với format chuẩn
  - Cài đặt Vitest, fast-check, jsdom, @vitest/coverage-v8
  - Tạo vitest.config.js với environment jsdom, coverage provider v8, thresholds 60%
  - Cài đặt Vite, tạo vite.config.js với multi-page entry points, manualChunks cho shared, target es2020
  - Cập nhật package.json scripts: test, test:coverage, build:vite, dev:vite
- **Rollback:** `git checkout backup/pre-optimization`
