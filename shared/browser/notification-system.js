/**
 * Notification System - ES Module (SOURCE OF TRUTH)
 *
 * Toast notifications with Lucide icons + custom confirm dialogs.
 *
 * @module shared/browser/notification-system
 *
 * Usage:
 * ```javascript
 * import { NotificationManager, getNotificationManager } from '/shared/browser/notification-system.js';
 *
 * const notify = getNotificationManager();
 * notify.success('Saved!');
 * notify.error('Something went wrong');
 * const confirmed = await notify.confirm('Are you sure?');
 * ```
 */

// =====================================================
// NOTIFICATION CONFIGURATION
// =====================================================

export const NOTIFICATION_CONFIG = {
    durations: {
        success: 2000,
        error: 4000,
        warning: 3000,
        info: 3000,
    },
    icons: {
        success: 'check-circle',
        error: 'x-circle',
        warning: 'alert-triangle',
        info: 'info',
        loading: 'loader',
    },
    titles: {
        success: 'Thành công',
        error: 'Lỗi',
        warning: 'Cảnh báo',
        loading: 'Đang tải',
    },
    zIndex: {
        container: 99999,
        overlay: 2999,
        confirmOverlay: 10010,
    },
};

// =====================================================
// NOTIFICATION MANAGER CLASS
// =====================================================

export class NotificationManager {
    constructor(options = {}) {
        this.container = null;
        this.notifications = new Map();
        this.notificationCounter = 0;
        this.config = { ...NOTIFICATION_CONFIG, ...options };
        this._stylesInjected = false;
        this.init();
    }

    init() {
        // Inject styles if not already done
        if (!this._stylesInjected) {
            this._injectStyles();
            this._stylesInjected = true;
        }

        // Create container
        this.container = document.createElement('div');
        this.container.id = 'notification-container';
        this.container.className = 'toast-container';
        document.body.appendChild(this.container);
    }

    /**
     * Show a notification
     * @param {string} message - Notification message
     * @param {string} type - Type: success, error, warning, info
     * @param {number} duration - Duration in ms (0 = no auto-dismiss)
     * @param {Object} options - Additional options
     * @returns {number} - Notification ID
     */
    show(message, type = 'info', duration = 3000, options = {}) {
        const {
            showOverlay = false,
            showProgress = true,
            persistent = false,
            icon = null,
            title = null,
        } = options;

        if (showOverlay || persistent) this.clearAll();

        const notificationId = ++this.notificationCounter;
        const notification = document.createElement('div');
        notification.className = `toast ${type}`;
        notification.dataset.id = notificationId;

        const selectedIcon = icon || this.config.icons[type] || 'bell';

        // Build notification HTML
        const iconHtml = `<i data-lucide="${selectedIcon}" class="toast-icon ${type === 'loading' ? 'spinning' : ''}"></i>`;
        const titleHtml = title ? `<div class="toast-title">${title}</div>` : '';
        const messageHtml = `<div class="toast-message">${message}</div>`;
        const closeBtn = !persistent
            ? `<button class="toast-close"><i data-lucide="x"></i></button>`
            : '';

        notification.innerHTML = `
            ${iconHtml}
            <div class="toast-content">
                ${titleHtml}
                ${messageHtml}
            </div>
            ${closeBtn}
            ${showProgress && duration > 0 ? '<div class="toast-progress"></div>' : ''}
        `;

        // Close button handler
        const closeBtnEl = notification.querySelector('.toast-close');
        if (closeBtnEl) {
            closeBtnEl.onclick = () => this.remove(notificationId);
        }

        // Progress bar animation
        if (showProgress && duration > 0) {
            notification.style.setProperty('--duration', duration + 'ms');
        }

        this.container.appendChild(notification);

        // Initialize Lucide icons
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

        this.notifications.set(notificationId, {
            element: notification,
            type,
            timeout: null,
            showOverlay,
        });

        if (showOverlay) {
            this.showOverlay();
            document.body.style.overflow = 'hidden';
        }

        // Animate in
        requestAnimationFrame(() => notification.classList.add('show'));

        // Auto-remove after duration
        if (duration > 0 && !persistent) {
            const timeoutId = setTimeout(
                () => this.remove(notificationId),
                duration,
            );
            this.notifications.get(notificationId).timeout = timeoutId;
        }

        return notificationId;
    }

    /**
     * Remove a notification by ID
     * @param {number} notificationId - Notification ID
     */
    remove(notificationId) {
        const notification = this.notifications.get(notificationId);
        if (!notification) return;

        if (notification.timeout) clearTimeout(notification.timeout);
        notification.element.classList.remove('show');

        setTimeout(() => {
            if (notification.element && notification.element.parentNode) {
                notification.element.parentNode.removeChild(notification.element);
            }
            this.notifications.delete(notificationId);
            if (notification.showOverlay) this.hideOverlay();
        }, 300);
    }

    /**
     * Clear all notifications
     */
    clearAll() {
        for (const [id] of this.notifications) this.remove(id);
        this.forceHideOverlay();
    }

    /**
     * Force hide overlay
     */
    forceHideOverlay() {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) overlay.classList.remove('show');
        document.body.style.overflow = 'auto';
    }

    /**
     * Show loading overlay
     */
    showOverlay() {
        let overlay = document.getElementById('loading-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'loading-overlay';
            overlay.className = 'loading-overlay';
            document.body.appendChild(overlay);
        }
        overlay.classList.add('show');
    }

    /**
     * Hide loading overlay
     */
    hideOverlay() {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) overlay.classList.remove('show');
        document.body.style.overflow = 'auto';
    }

    // =====================================================
    // CONVENIENCE METHODS
    // =====================================================

    /**
     * Show loading notification with overlay
     */
    loading(message = 'Đang xử lý...', title = null) {
        return this.show(message, 'info', 0, {
            showOverlay: true,
            persistent: true,
            icon: 'loader',
            title: title || this.config.titles.loading,
        });
    }

    /**
     * Show success notification
     */
    success(message, duration = this.config.durations.success, title = null) {
        return this.show(message, 'success', duration, {
            showProgress: true,
            title: title || this.config.titles.success,
        });
    }

    /**
     * Show error notification
     */
    error(message, duration = this.config.durations.error, title = null) {
        return this.show(message, 'error', duration, {
            showProgress: true,
            title: title || this.config.titles.error,
        });
    }

    /**
     * Show warning notification
     */
    warning(message, duration = this.config.durations.warning, title = null) {
        return this.show(message, 'warning', duration, {
            showProgress: true,
            title: title || this.config.titles.warning,
        });
    }

    /**
     * Show info notification
     */
    info(message, duration = this.config.durations.info, title = null) {
        return this.show(message, 'info', duration, {
            showProgress: true,
            title: title,
        });
    }

    // =====================================================
    // ACTION-SPECIFIC METHODS
    // =====================================================

    /**
     * Show upload progress notification
     */
    uploading(current, total) {
        const message = `Đang tải lên ${current}/${total} ảnh`;
        return this.show(message, 'info', 0, {
            showOverlay: true,
            persistent: true,
            icon: 'upload-cloud',
            title: 'Upload',
        });
    }

    /**
     * Show deleting notification
     */
    deleting(message = 'Đang xóa...') {
        return this.show(message, 'warning', 0, {
            showOverlay: true,
            persistent: true,
            icon: 'trash-2',
            title: 'Xóa dữ liệu',
        });
    }

    /**
     * Show saving notification
     */
    saving(message = 'Đang lưu...') {
        return this.show(message, 'info', 0, {
            showOverlay: true,
            persistent: true,
            icon: 'save',
            title: 'Lưu',
        });
    }

    /**
     * Show loading data notification
     */
    loadingData(message = 'Đang tải dữ liệu...') {
        return this.show(message, 'info', 0, {
            showOverlay: true,
            persistent: true,
            icon: 'database',
            title: 'Tải dữ liệu',
        });
    }

    /**
     * Show processing notification
     */
    processing(message = 'Đang xử lý...') {
        return this.show(message, 'info', 0, {
            showOverlay: true,
            persistent: true,
            icon: 'cpu',
            title: 'Xử lý',
        });
    }

    // =====================================================
    // CONFIRM DIALOG
    // =====================================================

    /**
     * Custom confirm dialog to replace native confirm()
     * @param {string} message - The message to display
     * @param {string} title - The title of the dialog
     * @returns {Promise<boolean>} - Resolves to true if confirmed
     */
    confirm(message, title = 'Xác nhận') {
        return new Promise((resolve) => {
            // Create overlay
            const overlay = document.createElement('div');
            overlay.className = 'custom-confirm-overlay';
            overlay.id = 'customConfirmOverlay';

            // Create modal
            const modal = document.createElement('div');
            modal.className = 'custom-confirm-modal';
            modal.innerHTML = `
                <div class="custom-confirm-header">
                    <i data-lucide="alert-circle" class="custom-confirm-icon"></i>
                    <h3>${title}</h3>
                </div>
                <div class="custom-confirm-body">
                    <p>${message}</p>
                </div>
                <div class="custom-confirm-footer">
                    <button class="custom-confirm-btn custom-confirm-cancel">
                        <i data-lucide="x"></i>
                        Hủy
                    </button>
                    <button class="custom-confirm-btn custom-confirm-ok">
                        <i data-lucide="check"></i>
                        Đồng ý
                    </button>
                </div>
            `;

            overlay.appendChild(modal);
            document.body.appendChild(overlay);

            // Initialize Lucide icons
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }

            // Animate in
            requestAnimationFrame(() => {
                overlay.classList.add('show');
            });

            // Close function
            const closeModal = (result) => {
                overlay.classList.remove('show');
                setTimeout(() => {
                    overlay.remove();
                    resolve(result);
                }, 200);
            };

            // Event handlers
            const cancelBtn = modal.querySelector('.custom-confirm-cancel');
            const okBtn = modal.querySelector('.custom-confirm-ok');

            cancelBtn.onclick = () => closeModal(false);
            okBtn.onclick = () => closeModal(true);

            // Close on overlay click
            overlay.onclick = (e) => {
                if (e.target === overlay) {
                    closeModal(false);
                }
            };

            // Close on Escape key
            const handleKeydown = (e) => {
                if (e.key === 'Escape') {
                    closeModal(false);
                    document.removeEventListener('keydown', handleKeydown);
                } else if (e.key === 'Enter') {
                    closeModal(true);
                    document.removeEventListener('keydown', handleKeydown);
                }
            };
            document.addEventListener('keydown', handleKeydown);

            // Focus OK button
            okBtn.focus();
        });
    }

    // =====================================================
    // STYLES INJECTION
    // =====================================================

    _injectStyles() {
        const styles = `
<style id="notification-system-styles">
.toast-container {
    position: fixed;
    top: 80px;
    right: var(--spacing-xl, 24px);
    z-index: ${this.config.zIndex.container};
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md, 12px);
    pointer-events: none;
    max-width: 420px;
}

.toast {
    min-width: 320px;
    padding: var(--spacing-lg, 16px);
    background: white;
    border-radius: var(--radius-lg, 12px);
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
    display: flex;
    align-items: flex-start;
    gap: var(--spacing-md, 12px);
    opacity: 0;
    transform: translateX(400px);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    pointer-events: auto;
    position: relative;
    overflow: hidden;
    border-left: 4px solid;
}

.toast.show {
    opacity: 1;
    transform: translateX(0);
}

.toast.success { border-left-color: var(--success, #10b981); }
.toast.error { border-left-color: var(--danger, #ef4444); }
.toast.warning { border-left-color: var(--warning, #f59e0b); }
.toast.info { border-left-color: var(--info, #3b82f6); }

.toast-icon {
    width: 24px;
    height: 24px;
    flex-shrink: 0;
    margin-top: 2px;
}

.toast.success .toast-icon { color: var(--success, #10b981); }
.toast.error .toast-icon { color: var(--danger, #ef4444); }
.toast.warning .toast-icon { color: var(--warning, #f59e0b); }
.toast.info .toast-icon { color: var(--info, #3b82f6); }

.toast-icon.spinning {
    animation: notification-spin 1s linear infinite;
}

@keyframes notification-spin {
    to { transform: rotate(360deg); }
}

.toast-content {
    flex: 1;
    min-width: 0;
}

.toast-title {
    font-weight: 600;
    color: var(--text-primary, #111827);
    margin-bottom: 4px;
    font-size: 0.9375rem;
}

.toast-message {
    font-size: 0.875rem;
    color: var(--text-secondary, #6b7280);
    line-height: 1.5;
}

.toast-close {
    width: 28px;
    height: 28px;
    border: none;
    background: transparent;
    color: var(--text-tertiary, #9ca3af);
    border-radius: var(--radius, 8px);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.15s;
    flex-shrink: 0;
}

.toast-close:hover {
    background: var(--gray-100, #f3f4f6);
    color: var(--text-primary, #111827);
}

.toast-close i {
    width: 16px;
    height: 16px;
}

.toast-progress {
    position: absolute;
    bottom: 0;
    left: 0;
    height: 3px;
    width: 100%;
    background: linear-gradient(90deg, var(--primary, #6366f1) 0%, var(--primary-light, #818cf8) 100%);
    transform-origin: left;
    animation: notification-progress var(--duration, 3000ms) linear forwards;
}

.toast.success .toast-progress {
    background: linear-gradient(90deg, var(--success, #10b981) 0%, #34d399 100%);
}

.toast.error .toast-progress {
    background: linear-gradient(90deg, var(--danger, #ef4444) 0%, #f87171 100%);
}

.toast.warning .toast-progress {
    background: linear-gradient(90deg, var(--warning, #f59e0b) 0%, #fbbf24 100%);
}

@keyframes notification-progress {
    to { transform: scaleX(0); }
}

.loading-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    z-index: ${this.config.zIndex.overlay};
    opacity: 0;
    transition: opacity 0.3s;
    pointer-events: none;
    backdrop-filter: blur(2px);
}

.loading-overlay.show {
    opacity: 1;
    pointer-events: auto;
}

@media (max-width: 768px) {
    .toast-container {
        top: var(--spacing-md, 12px);
        right: var(--spacing-md, 12px);
        left: var(--spacing-md, 12px);
        max-width: none;
    }

    .toast {
        min-width: auto;
        width: 100%;
    }
}

/* Custom Confirm Dialog Styles */
.custom-confirm-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    z-index: ${this.config.zIndex.confirmOverlay};
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.2s ease-out;
    backdrop-filter: blur(2px);
}

.custom-confirm-overlay.show {
    opacity: 1;
}

.custom-confirm-modal {
    background: white;
    border-radius: 16px;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
    max-width: 420px;
    width: 90%;
    transform: scale(0.95) translateY(-20px);
    transition: transform 0.2s ease-out;
    overflow: hidden;
}

.custom-confirm-overlay.show .custom-confirm-modal {
    transform: scale(1) translateY(0);
}

.custom-confirm-header {
    padding: 20px 24px 16px;
    display: flex;
    align-items: center;
    gap: 12px;
    background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
    color: white;
}

.custom-confirm-header h3 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
}

.custom-confirm-icon {
    width: 24px;
    height: 24px;
}

.custom-confirm-body {
    padding: 24px;
}

.custom-confirm-body p {
    margin: 0;
    font-size: 15px;
    color: #374151;
    line-height: 1.6;
}

.custom-confirm-footer {
    padding: 16px 24px;
    display: flex;
    gap: 12px;
    justify-content: flex-end;
    background: #f9fafb;
    border-top: 1px solid #e5e7eb;
}

.custom-confirm-btn {
    padding: 10px 20px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
    transition: all 0.15s;
    border: none;
}

.custom-confirm-btn i {
    width: 16px;
    height: 16px;
}

.custom-confirm-cancel {
    background: white;
    color: #6b7280;
    border: 1px solid #d1d5db;
}

.custom-confirm-cancel:hover {
    background: #f3f4f6;
    border-color: #9ca3af;
}

.custom-confirm-ok {
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    color: white;
}

.custom-confirm-ok:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
}

.custom-confirm-ok:focus {
    outline: none;
    box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.3);
}
</style>`;

        document.head.insertAdjacentHTML('beforeend', styles);
    }
}

// =====================================================
// SINGLETON & FACTORY
// =====================================================

let _notificationManager = null;

/**
 * Get singleton NotificationManager instance
 * @returns {NotificationManager}
 */
export function getNotificationManager() {
    if (!_notificationManager) {
        _notificationManager = new NotificationManager();
    }
    return _notificationManager;
}

/**
 * Create a new NotificationManager instance
 * @param {Object} options - Configuration options
 * @returns {NotificationManager}
 */
export function createNotificationManager(options = {}) {
    return new NotificationManager(options);
}

// =====================================================
// DEFAULT EXPORT
// =====================================================

export default NotificationManager;
