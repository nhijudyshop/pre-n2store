// =====================================================
// AUDIT LOGGER - ES Module Wrapper
// File: shared/js/audit-logger.esm.js
// Wrapper cho Customer Hub (dùng ES Module import)
// File chính audit-logger.js set window.AuditLogger qua IIFE
// File này re-export từ window.AuditLogger
// =====================================================

export var logAction = window.AuditLogger.logAction;
export var isValidActionType = window.AuditLogger.isValidActionType;
export var VALID_ACTION_TYPES = window.AuditLogger.VALID_ACTION_TYPES;
