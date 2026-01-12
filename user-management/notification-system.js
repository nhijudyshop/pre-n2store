// =====================================================
// ENHANCED NOTIFICATION MANAGER WITH LUCIDE ICONS
// =====================================================
class NotificationManager {
    constructor() {
        this.container = null;
        this.notifications = new Map();
        this.notificationCounter = 0;
        this.init();
    }

    init() {
        this.container = document.createElement("div");
        this.container.id = "notification-container";
        this.container.className = "toast-container";
        document.body.appendChild(this.container);
    }

    show(message, type = "info", duration = 3000, options = {}) {
        const {
            showOverlay = false,
            showProgress = true,
            persistent = false,
            icon = null,
            title = null,
        } = options;

        if (showOverlay || persistent) this.clearAll();

        const notificationId = ++this.notificationCounter;
        const notification = document.createElement("div");
        notification.className = `toast ${type}`;
        notification.dataset.id = notificationId;

        // Icon mapping for Lucide
        const iconMap = {
            success: "check-circle",
            error: "x-circle",
            warning: "alert-triangle",
            info: "info",
            loading: "loader",
        };

        const selectedIcon = icon || iconMap[type] || "bell";

        // Build notification HTML
        const iconHtml = `<i data-lucide="${selectedIcon}" class="toast-icon ${type === "loading" ? "spinning" : ""}"></i>`;
        const titleHtml = title
            ? `<div class="toast-title">${title}</div>`
            : "";
        const messageHtml = `<div class="toast-message">${message}</div>`;
        const closeBtn = !persistent
            ? `<button class="toast-close"><i data-lucide="x"></i></button>`
            : "";

        notification.innerHTML = `
            ${iconHtml}
            <div class="toast-content">
                ${titleHtml}
                ${messageHtml}
            </div>
            ${closeBtn}
            ${showProgress && duration > 0 ? '<div class="toast-progress"></div>' : ""}
        `;

        // Close button handler
        const closeBtnEl = notification.querySelector(".toast-close");
        if (closeBtnEl) {
            closeBtnEl.onclick = () => this.remove(notificationId);
        }

        // Progress bar animation
        if (showProgress && duration > 0) {
            notification.style.setProperty("--duration", duration + "ms");
        }

        this.container.appendChild(notification);

        // Initialize Lucide icons
        if (typeof lucide !== "undefined") {
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
            document.body.style.overflow = "hidden";
        }

        // Animate in
        requestAnimationFrame(() => notification.classList.add("show"));

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

    remove(notificationId) {
        const notification = this.notifications.get(notificationId);
        if (!notification) return;

        if (notification.timeout) clearTimeout(notification.timeout);
        notification.element.classList.remove("show");

        setTimeout(() => {
            if (notification.element && notification.element.parentNode) {
                notification.element.parentNode.removeChild(
                    notification.element,
                );
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
        const overlay = document.getElementById("loading-overlay");
        if (overlay) overlay.classList.remove("show");
        document.body.style.overflow = "auto";
    }

    showOverlay() {
        let overlay = document.getElementById("loading-overlay");
        if (!overlay) {
            overlay = document.createElement("div");
            overlay.id = "loading-overlay";
            overlay.className = "loading-overlay";
            document.body.appendChild(overlay);
        }
        overlay.classList.add("show");
    }

    hideOverlay() {
        const overlay = document.getElementById("loading-overlay");
        if (overlay) overlay.classList.remove("show");
        document.body.style.overflow = "auto";
    }

    // Convenience methods with proper icons
    loading(message = "Đang xử lý...", title = null) {
        return this.show(message, "info", 0, {
            showOverlay: true,
            persistent: true,
            icon: "loader",
            title: title || "Đang tải",
        });
    }

    success(message, duration = 2000, title = null) {
        return this.show(message, "success", duration, {
            showProgress: true,
            title: title || "Thành công",
        });
    }

    error(message, duration = 4000, title = null) {
        return this.show(message, "error", duration, {
            showProgress: true,
            title: title || "Lỗi",
        });
    }

    warning(message, duration = 3000, title = null) {
        return this.show(message, "warning", duration, {
            showProgress: true,
            title: title || "Cảnh báo",
        });
    }

    info(message, duration = 3000, title = null) {
        return this.show(message, "info", duration, {
            showProgress: true,
            title: title,
        });
    }

    // Action-specific notifications
    uploading(current, total) {
        const message = `Đang tải lên ${current}/${total} ảnh`;
        return this.show(message, "info", 0, {
            showOverlay: true,
            persistent: true,
            icon: "upload-cloud",
            title: "Upload",
        });
    }

    deleting(message = "Đang xóa...") {
        return this.show(message, "warning", 0, {
            showOverlay: true,
            persistent: true,
            icon: "trash-2",
            title: "Xóa dữ liệu",
        });
    }

    saving(message = "Đang lưu...") {
        return this.show(message, "info", 0, {
            showOverlay: true,
            persistent: true,
            icon: "save",
            title: "Lưu",
        });
    }

    loadingData(message = "Đang tải dữ liệu...") {
        return this.show(message, "info", 0, {
            showOverlay: true,
            persistent: true,
            icon: "database",
            title: "Tải dữ liệu",
        });
    }

    processing(message = "Đang xử lý...") {
        return this.show(message, "info", 0, {
            showOverlay: true,
            persistent: true,
            icon: "cpu",
            title: "Xử lý",
        });
    }
}

// Enhanced CSS for the new notification system
const notificationStyles = `
<style>
.toast-container {
    position: fixed;
    top: 80px;
    right: var(--spacing-xl, 24px);
    z-index: 3000;
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

.toast.success {
    border-left-color: var(--success, #10b981);
}

.toast.error {
    border-left-color: var(--danger, #ef4444);
}

.toast.warning {
    border-left-color: var(--warning, #f59e0b);
}

.toast.info {
    border-left-color: var(--info, #3b82f6);
}

.toast-icon {
    width: 24px;
    height: 24px;
    flex-shrink: 0;
    margin-top: 2px;
}

.toast.success .toast-icon {
    color: var(--success, #10b981);
}

.toast.error .toast-icon {
    color: var(--danger, #ef4444);
}

.toast.warning .toast-icon {
    color: var(--warning, #f59e0b);
}

.toast.info .toast-icon {
    color: var(--info, #3b82f6);
}

.toast-icon.spinning {
    animation: spin 1s linear infinite;
}

@keyframes spin {
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
    background: linear-gradient(90deg, 
        var(--primary, #6366f1) 0%, 
        var(--primary-light, #818cf8) 100%
    );
    transform-origin: left;
    animation: progress var(--duration, 3000ms) linear forwards;
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

@keyframes progress {
    to { transform: scaleX(0); }
}

.loading-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    z-index: 2999;
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
</style>
`;

// Inject styles
document.head.insertAdjacentHTML("beforeend", notificationStyles);
