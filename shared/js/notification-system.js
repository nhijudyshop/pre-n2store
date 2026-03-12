/**
 * Notification System - Script-Tag Compatible Wrapper
 *
 * SOURCE OF TRUTH: /shared/browser/notification-system.js (ES Module)
 *
 * This file provides window.* exports for legacy script-tag usage.
 * For ES Module usage, import from '/shared/browser/notification-system.js'.
 *
 * Usage:
 * <script src="../shared/js/notification-system.js"></script>
 * <script>
 *   notificationManager.success('Saved!');
 *   notificationManager.error('Error!');
 *   const confirmed = await notificationManager.confirm('Are you sure?');
 * </script>
 */

// =====================================================
// NOTIFICATION CONFIGURATION
// =====================================================

const NOTIFICATION_CONFIG = {
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
        container: 200000,
        overlay: 2999,
        confirmOverlay: 200001,
    },
};

// =====================================================
// NOTIFICATION MANAGER CLASS
// =====================================================

class NotificationManager {
    constructor(options = {}) {
        this.container = null;
        this.notifications = new Map();
        this.notificationCounter = 0;
        this.config = { ...NOTIFICATION_CONFIG, ...options };
        this._stylesInjected = false;
        this.init();
    }

    init() {
        // Wait for DOM to be ready if body doesn't exist yet
        if (!document.body) {
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => this.init());
            } else {
                // Fallback: try again after a short delay
                setTimeout(() => this.init(), 10);
            }
            return;
        }

        if (!this._stylesInjected) {
            this._injectStyles();
            this._stylesInjected = true;
        }

        this.container = document.createElement('div');
        this.container.id = 'notification-container';
        this.container.className = 'toast-container';
        this.container.style.zIndex = String(this.config.zIndex.container);
        document.body.appendChild(this.container);
    }

    show(message, type = 'info', duration = 3000, options = {}) {
        // Ensure container is ready
        if (!this.container) {
            this.init();
            // If still not ready (waiting for DOM), queue the notification
            if (!this.container) {
                setTimeout(() => this.show(message, type, duration, options), 50);
                return null;
            }
        }

        // Re-append to end of body so container is always above any modals
        document.body.appendChild(this.container);

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

        const closeBtnEl = notification.querySelector('.toast-close');
        if (closeBtnEl) {
            closeBtnEl.onclick = () => this.remove(notificationId);
        }

        if (showProgress && duration > 0) {
            notification.style.setProperty('--duration', duration + 'ms');
        }

        this.container.appendChild(notification);

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

        requestAnimationFrame(() => notification.classList.add('show'));

        if (duration > 0 && !persistent) {
            const timeoutId = setTimeout(
                () => this.remove(notificationId),
                duration,
            );
            this.notifications.get(notificationId).timeout = timeoutId;
        }

        return notificationId;
    }

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

    clearAll() {
        for (const [id] of this.notifications) this.remove(id);
        this.forceHideOverlay();
    }

    forceHideOverlay() {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) overlay.classList.remove('show');
        document.body.style.overflow = 'auto';
    }

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

    hideOverlay() {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) overlay.classList.remove('show');
        document.body.style.overflow = 'auto';
    }

    // Convenience methods
    loading(message = 'Đang xử lý...', title = null) {
        return this.show(message, 'info', 0, {
            showOverlay: true,
            persistent: true,
            icon: 'loader',
            title: title || this.config.titles.loading,
        });
    }

    success(message, duration = this.config.durations.success, title = null) {
        return this.show(message, 'success', duration, {
            showProgress: true,
            title: title || this.config.titles.success,
        });
    }

    error(message, duration = this.config.durations.error, title = null) {
        return this.show(message, 'error', duration, {
            showProgress: true,
            title: title || this.config.titles.error,
        });
    }

    warning(message, duration = this.config.durations.warning, title = null) {
        return this.show(message, 'warning', duration, {
            showProgress: true,
            title: title || this.config.titles.warning,
        });
    }

    info(message, duration = this.config.durations.info, title = null) {
        return this.show(message, 'info', duration, {
            showProgress: true,
            title: title,
        });
    }

    // Action-specific methods
    uploading(current, total) {
        const message = `Đang tải lên ${current}/${total} ảnh`;
        return this.show(message, 'info', 0, {
            showOverlay: true,
            persistent: true,
            icon: 'upload-cloud',
            title: 'Upload',
        });
    }

    deleting(message = 'Đang xóa...') {
        return this.show(message, 'warning', 0, {
            showOverlay: true,
            persistent: true,
            icon: 'trash-2',
            title: 'Xóa dữ liệu',
        });
    }

    saving(message = 'Đang lưu...') {
        return this.show(message, 'info', 0, {
            showOverlay: true,
            persistent: true,
            icon: 'save',
            title: 'Lưu',
        });
    }

    loadingData(message = 'Đang tải dữ liệu...') {
        return this.show(message, 'info', 0, {
            showOverlay: true,
            persistent: true,
            icon: 'database',
            title: 'Tải dữ liệu',
        });
    }

    processing(message = 'Đang xử lý...') {
        return this.show(message, 'info', 0, {
            showOverlay: true,
            persistent: true,
            icon: 'cpu',
            title: 'Xử lý',
        });
    }

    // Custom confirm dialog
    confirm(message, title = 'Xác nhận') {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'custom-confirm-overlay';
            overlay.id = 'customConfirmOverlay';

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

            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }

            requestAnimationFrame(() => {
                overlay.classList.add('show');
            });

            const closeModal = (result) => {
                overlay.classList.remove('show');
                setTimeout(() => {
                    overlay.remove();
                    resolve(result);
                }, 200);
            };

            const cancelBtn = modal.querySelector('.custom-confirm-cancel');
            const okBtn = modal.querySelector('.custom-confirm-ok');

            cancelBtn.onclick = () => closeModal(false);
            okBtn.onclick = () => closeModal(true);

            overlay.onclick = (e) => {
                if (e.target === overlay) {
                    closeModal(false);
                }
            };

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

            okBtn.focus();
        });
    }

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

.toast.show { opacity: 1; transform: translateX(0); }
.toast.success { border-left-color: var(--success, #10b981); }
.toast.error { border-left-color: var(--danger, #ef4444); }
.toast.warning { border-left-color: var(--warning, #f59e0b); }
.toast.info { border-left-color: var(--info, #3b82f6); }

.toast-icon { width: 24px; height: 24px; flex-shrink: 0; margin-top: 2px; }
.toast.success .toast-icon { color: var(--success, #10b981); }
.toast.error .toast-icon { color: var(--danger, #ef4444); }
.toast.warning .toast-icon { color: var(--warning, #f59e0b); }
.toast.info .toast-icon { color: var(--info, #3b82f6); }

.toast-icon.spinning { animation: notification-spin 1s linear infinite; }
@keyframes notification-spin { to { transform: rotate(360deg); } }

.toast-content { flex: 1; min-width: 0; }
.toast-title { font-weight: 600; color: var(--text-primary, #111827); margin-bottom: 4px; font-size: 0.9375rem; }
.toast-message { font-size: 0.875rem; color: var(--text-secondary, #6b7280); line-height: 1.5; }

.toast-close {
    width: 28px; height: 28px; border: none; background: transparent;
    color: var(--text-tertiary, #9ca3af); border-radius: var(--radius, 8px);
    display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.15s; flex-shrink: 0;
}
.toast-close:hover { background: var(--gray-100, #f3f4f6); color: var(--text-primary, #111827); }
.toast-close i { width: 16px; height: 16px; }

.toast-progress {
    position: absolute; bottom: 0; left: 0; height: 3px; width: 100%;
    background: linear-gradient(90deg, var(--primary, #6366f1) 0%, var(--primary-light, #818cf8) 100%);
    transform-origin: left; animation: notification-progress var(--duration, 3000ms) linear forwards;
}
.toast.success .toast-progress { background: linear-gradient(90deg, var(--success, #10b981) 0%, #34d399 100%); }
.toast.error .toast-progress { background: linear-gradient(90deg, var(--danger, #ef4444) 0%, #f87171 100%); }
.toast.warning .toast-progress { background: linear-gradient(90deg, var(--warning, #f59e0b) 0%, #fbbf24 100%); }
@keyframes notification-progress { to { transform: scaleX(0); } }

.loading-overlay {
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0, 0, 0, 0.5); z-index: ${this.config.zIndex.overlay};
    opacity: 0; transition: opacity 0.3s; pointer-events: none; backdrop-filter: blur(2px);
}
.loading-overlay.show { opacity: 1; pointer-events: auto; }

@media (max-width: 768px) {
    .toast-container { top: var(--spacing-md, 12px); right: var(--spacing-md, 12px); left: var(--spacing-md, 12px); max-width: none; }
    .toast { min-width: auto; width: 100%; }
}

/* Custom Confirm Dialog */
.custom-confirm-overlay {
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0, 0, 0, 0.5); z-index: ${this.config.zIndex.confirmOverlay};
    display: flex; align-items: center; justify-content: center;
    opacity: 0; transition: opacity 0.2s ease-out; backdrop-filter: blur(2px);
}
.custom-confirm-overlay.show { opacity: 1; }

.custom-confirm-modal {
    background: white; border-radius: 16px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
    max-width: 420px; width: 90%; transform: scale(0.95) translateY(-20px);
    transition: transform 0.2s ease-out; overflow: hidden;
}
.custom-confirm-overlay.show .custom-confirm-modal { transform: scale(1) translateY(0); }

.custom-confirm-header {
    padding: 20px 24px 16px; display: flex; align-items: center; gap: 12px;
    background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white;
}
.custom-confirm-header h3 { margin: 0; font-size: 18px; font-weight: 600; }
.custom-confirm-icon { width: 24px; height: 24px; }

.custom-confirm-body { padding: 24px; }
.custom-confirm-body p { margin: 0; font-size: 15px; color: #374151; line-height: 1.6; }

.custom-confirm-footer {
    padding: 16px 24px; display: flex; gap: 12px; justify-content: flex-end;
    background: #f9fafb; border-top: 1px solid #e5e7eb;
}

.custom-confirm-btn {
    padding: 10px 20px; border-radius: 8px; font-size: 14px; font-weight: 500;
    cursor: pointer; display: flex; align-items: center; gap: 6px; transition: all 0.15s; border: none;
}
.custom-confirm-btn i { width: 16px; height: 16px; }

.custom-confirm-cancel { background: white; color: #6b7280; border: 1px solid #d1d5db; }
.custom-confirm-cancel:hover { background: #f3f4f6; border-color: #9ca3af; }

.custom-confirm-ok { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; }
.custom-confirm-ok:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4); }
.custom-confirm-ok:focus { outline: none; box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.3); }
</style>`;

        document.head.insertAdjacentHTML('beforeend', styles);
    }
}

// =====================================================
// GLOBAL EXPORTS
// =====================================================

if (typeof window !== 'undefined') {
    window.NotificationManager = NotificationManager;
    window.NOTIFICATION_CONFIG = NOTIFICATION_CONFIG;
    window.notificationManager = new NotificationManager();
}

// Module exports
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { NotificationManager, NOTIFICATION_CONFIG };
}

console.log('[Notification System] Module loaded');
