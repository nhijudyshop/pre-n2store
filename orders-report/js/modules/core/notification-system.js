/**
 * Enhanced Notification System - ES Module
 * Re-exports from shared library
 *
 * SOURCE OF TRUTH: /shared/browser/notification-system.js
 */

// Import from shared library
import {
    NotificationManager,
    NOTIFICATION_CONFIG,
    getNotificationManager,
    createNotificationManager,
} from '../../../../shared/browser/notification-system.js';

// =====================================================
// SINGLETON INSTANCE & CONVENIENCE FUNCTIONS
// =====================================================

// Re-export for compatibility with old imports
export {
    NotificationManager,
    NOTIFICATION_CONFIG,
    getNotificationManager,
    createNotificationManager,
};

// Get singleton instance (compatible with old code using NotificationSystem)
export const NotificationSystem = getNotificationManager();

// Convenience functions for direct usage
export function showNotification(message, type = 'info', duration = 3000, options = {}) {
    return NotificationSystem.show(message, type, duration, options);
}

export function showToast(message, type = 'info', duration = 3000) {
    return NotificationSystem.show(message, type, duration);
}

export function showLoading(message = 'Đang xử lý...') {
    return NotificationSystem.loading(message);
}

export function hideLoading(id) {
    return NotificationSystem.remove(id);
}

export function showConfirm(message, title = 'Xác nhận') {
    return NotificationSystem.confirm(message, title);
}

console.log('[NOTIFICATION] ES Module loaded (using shared NotificationManager)');

export default NotificationSystem;
