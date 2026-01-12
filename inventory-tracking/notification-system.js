// =====================================================
// NOTIFICATION SYSTEM - INVENTORY TRACKING
// =====================================================

class NotificationManager {
    constructor() {
        this.container = null;
        this.init();
    }

    init() {
        // Get or create toast container
        this.container = document.getElementById('toastContainer');
        if (!this.container) {
            this.container = document.createElement('div');
            this.container.id = 'toastContainer';
            this.container.className = 'toast-container';
            document.body.appendChild(this.container);
        }
    }

    /**
     * Show a toast notification
     * @param {string} message - The message to display
     * @param {string} type - Type: 'success', 'error', 'warning', 'info'
     * @param {number} duration - Duration in milliseconds (default: 3000)
     */
    show(message, type = 'info', duration = 3000) {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;

        const icon = this.getIcon(type);
        toast.innerHTML = `
            <div class="toast-icon">
                <i data-lucide="${icon}"></i>
            </div>
            <div class="toast-content">
                <span class="toast-message">${message}</span>
            </div>
            <button class="toast-close">
                <i data-lucide="x"></i>
            </button>
        `;

        // Add close functionality
        const closeBtn = toast.querySelector('.toast-close');
        closeBtn.addEventListener('click', () => this.remove(toast));

        // Add to container
        this.container.appendChild(toast);

        // Initialize lucide icons for the toast
        if (window.lucide) {
            lucide.createIcons();
        }

        // Trigger animation
        requestAnimationFrame(() => {
            toast.classList.add('show');
        });

        // Auto remove after duration
        if (duration > 0) {
            setTimeout(() => this.remove(toast), duration);
        }

        return toast;
    }

    /**
     * Remove a toast
     */
    remove(toast) {
        if (!toast || !toast.parentNode) return;

        toast.classList.remove('show');
        toast.classList.add('hide');

        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    }

    /**
     * Get icon name based on type
     */
    getIcon(type) {
        const icons = {
            success: 'check-circle',
            error: 'x-circle',
            warning: 'alert-triangle',
            info: 'info',
        };
        return icons[type] || 'info';
    }

    // Convenience methods
    success(message, duration = 3000) {
        return this.show(message, 'success', duration);
    }

    error(message, duration = 5000) {
        return this.show(message, 'error', duration);
    }

    warning(message, duration = 4000) {
        return this.show(message, 'warning', duration);
    }

    info(message, duration = 3000) {
        return this.show(message, 'info', duration);
    }

    /**
     * Show loading toast (doesn't auto-dismiss)
     */
    loading(message = 'Dang xu ly...') {
        const toast = document.createElement('div');
        toast.className = 'toast toast-loading';
        toast.innerHTML = `
            <div class="toast-icon">
                <div class="loading-spinner-sm"></div>
            </div>
            <div class="toast-content">
                <span class="toast-message">${message}</span>
            </div>
        `;

        this.container.appendChild(toast);

        requestAnimationFrame(() => {
            toast.classList.add('show');
        });

        return toast;
    }
}

// Initialize notification manager
const notificationManager = new NotificationManager();
window.notificationManager = notificationManager;

// Alias for shorter access
window.toast = {
    success: (msg, dur) => notificationManager.success(msg, dur),
    error: (msg, dur) => notificationManager.error(msg, dur),
    warning: (msg, dur) => notificationManager.warning(msg, dur),
    info: (msg, dur) => notificationManager.info(msg, dur),
    loading: (msg) => notificationManager.loading(msg),
    remove: (t) => notificationManager.remove(t),
};

console.log('[NOTIFICATION] Notification system loaded');
