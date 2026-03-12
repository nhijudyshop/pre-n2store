// =====================================================
// DETAILED PERMISSIONS CONFIGURATION
// Derived from PAGES_REGISTRY (Single Source of Truth)
// =====================================================

// DETAILED_PERMISSIONS — sinh từ PAGES_REGISTRY thay vì hardcoded
const DETAILED_PERMISSIONS = (typeof PermissionsRegistry !== 'undefined')
    ? PermissionsRegistry.getAllDetailedPermissions()
    : {};

// PERMISSION_TEMPLATES — lấy từ window (đã export bởi permissions-registry.js)
const PERMISSION_TEMPLATES = (typeof window !== 'undefined' && window.PERMISSION_TEMPLATES)
    ? window.PERMISSION_TEMPLATES
    : {};

// generatePermissionsForRole() — REMOVED
// Thay bằng generateTemplatePermissions() từ PAGES_REGISTRY
// Sử dụng: PermissionsRegistry.generateTemplatePermissions(templateId)
