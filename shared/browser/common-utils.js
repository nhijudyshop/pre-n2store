/**
 * COMMON UI UTILITIES
 * SOURCE OF TRUTH - UI utilities for notifications, loading, and common interactions
 *
 * @module shared/browser/common-utils
 * @description Shared UI utilities for browser applications
 */

// getRoleInfo — UI display helper (moved from auth-manager.js during legacy cleanup)

/**
 * Get role info by checkLogin level (UI display only, NOT for permission checks)
 * @param {number} checkLogin
 * @returns {Object}
 */
function getRoleInfo(checkLogin) {
    const roleMap = {
        0: { icon: '👑', text: 'Admin', name: 'Admin' },
        1: { icon: '👤', text: 'User', name: 'Quản lý' },
        2: { icon: '🔒', text: 'Limited', name: 'Nhân viên' },
        3: { icon: '💡', text: 'Basic', name: 'Cơ bản' },
        777: { icon: '👥', text: 'Guest', name: 'Khách' }
    };
    return roleMap[checkLogin] || { icon: '❓', text: 'Unknown', name: 'Unknown' };
}

export { getRoleInfo };

// =====================================================
// FLOATING ALERT STATE
// =====================================================

const FloatingAlertState = {
    isPageBlocked: false,
    blockingOverlay: null
};

// =====================================================
// STATUS MESSAGE
// =====================================================

/**
 * Show status message in status indicator
 * @param {string} message
 * @param {string} type - info, success, error, warning
 */
export function showStatusMessage(message, type = 'info') {
    const indicator = document.getElementById('statusIndicator');
    if (indicator) {
        indicator.textContent = message;
        indicator.className = `status-indicator ${type} show`;

        setTimeout(() => {
            indicator.classList.remove('show');
        }, 3000);
    }
}

// =====================================================
// FLOATING ALERT SYSTEM
// =====================================================

/**
 * Show floating alert with optional page blocking
 * @param {string} message
 * @param {string} type - info, success, error, warning, loading
 * @param {number} duration
 */
export function showFloatingAlert(message, type = 'info', duration = 3000) {
    const alert = document.getElementById('floatingAlert');
    if (!alert) return;

    const alertText = alert.querySelector('.alert-text');
    const spinner = alert.querySelector('.loading-spinner');

    if (alertText) {
        alertText.textContent = message;
    } else {
        alert.textContent = message;
    }

    alert.className = 'show';

    if (type === 'loading') {
        alert.classList.add('loading');
        if (spinner) spinner.style.display = 'block';
        blockPageInteractions();
    } else {
        alert.classList.add(type);
        if (spinner) spinner.style.display = 'none';
        unblockPageInteractions();
    }

    if (type !== 'loading') {
        setTimeout(() => {
            alert.classList.remove('show');
        }, duration);
    }
}

/**
 * Hide floating alert
 */
export function hideFloatingAlert() {
    const alert = document.getElementById('floatingAlert');
    if (alert) {
        alert.classList.remove('show');
        unblockPageInteractions();
    }
}

// =====================================================
// PAGE BLOCKING
// =====================================================

/**
 * Block all page interactions (for loading states)
 */
export function blockPageInteractions() {
    if (FloatingAlertState.isPageBlocked) return;

    FloatingAlertState.isPageBlocked = true;
    createBlockingOverlay();

    document.body.style.pointerEvents = 'none';
    document.body.style.userSelect = 'none';
    document.body.classList.add('page-blocked');

    const alert = document.getElementById('floatingAlert');
    if (alert) {
        alert.style.pointerEvents = 'auto';
        alert.style.zIndex = '10000';
    }

    document.addEventListener('keydown', blockKeyboardInteraction, true);
    document.addEventListener('keyup', blockKeyboardInteraction, true);
    document.addEventListener('keypress', blockKeyboardInteraction, true);
    document.addEventListener('contextmenu', preventDefaultAction, true);
    document.addEventListener('dragstart', preventDefaultAction, true);
}

/**
 * Unblock page interactions
 */
export function unblockPageInteractions() {
    if (!FloatingAlertState.isPageBlocked) return;

    FloatingAlertState.isPageBlocked = false;
    removeBlockingOverlay();

    document.body.style.pointerEvents = '';
    document.body.style.userSelect = '';
    document.body.classList.remove('page-blocked');

    const alert = document.getElementById('floatingAlert');
    if (alert) {
        alert.style.pointerEvents = '';
        alert.style.zIndex = '';
    }

    document.removeEventListener('keydown', blockKeyboardInteraction, true);
    document.removeEventListener('keyup', blockKeyboardInteraction, true);
    document.removeEventListener('keypress', blockKeyboardInteraction, true);
    document.removeEventListener('contextmenu', preventDefaultAction, true);
    document.removeEventListener('dragstart', preventDefaultAction, true);
}

/**
 * Create blocking overlay
 */
function createBlockingOverlay() {
    if (FloatingAlertState.blockingOverlay) return;

    FloatingAlertState.blockingOverlay = document.createElement('div');
    FloatingAlertState.blockingOverlay.id = 'loadingBlockOverlay';
    FloatingAlertState.blockingOverlay.innerHTML = `
        <div class="blocking-content">
            <div class="blocking-spinner"></div>
            <div class="blocking-message">Vui lòng đợi...</div>
        </div>
    `;

    Object.assign(FloatingAlertState.blockingOverlay.style, {
        position: 'fixed',
        top: '0',
        left: '0',
        width: '100%',
        height: '100%',
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        zIndex: '9999',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backdropFilter: 'blur(2px)',
        cursor: 'wait',
    });

    document.body.appendChild(FloatingAlertState.blockingOverlay);

    setTimeout(() => {
        if (FloatingAlertState.blockingOverlay) {
            FloatingAlertState.blockingOverlay.style.opacity = '1';
        }
    }, 10);
}

/**
 * Remove blocking overlay
 */
function removeBlockingOverlay() {
    if (!FloatingAlertState.blockingOverlay) return;

    FloatingAlertState.blockingOverlay.style.opacity = '0';
    setTimeout(() => {
        if (FloatingAlertState.blockingOverlay?.parentNode) {
            FloatingAlertState.blockingOverlay.parentNode.removeChild(
                FloatingAlertState.blockingOverlay
            );
        }
        FloatingAlertState.blockingOverlay = null;
    }, 300);
}

/**
 * Block keyboard interaction handler
 */
function blockKeyboardInteraction(event) {
    if (event.key === 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    return false;
}

/**
 * Prevent default action handler
 */
function preventDefaultAction(event) {
    event.preventDefault();
    event.stopPropagation();
    return false;
}

// =====================================================
// CONVENIENCE FUNCTIONS
// =====================================================

/**
 * Show loading with page blocking
 * @param {string} message
 */
export function showLoading(message = 'Đang xử lý...') {
    showFloatingAlert(message, 'loading');
}

/**
 * Show success message
 * @param {string} message
 * @param {number} duration
 */
export function showSuccess(message = 'Thành công!', duration = 2000) {
    hideFloatingAlert();
    setTimeout(() => {
        showFloatingAlert(message, 'success', duration);
    }, 100);
}

/**
 * Show error message
 * @param {string} message
 * @param {number} duration
 */
export function showError(message = 'Có lỗi xảy ra!', duration = 3000) {
    hideFloatingAlert();
    setTimeout(() => {
        showFloatingAlert(message, 'error', duration);
    }, 100);
}

/**
 * Check if page is currently blocked
 * @returns {boolean}
 */
export function isPageBlocked() {
    return FloatingAlertState.isPageBlocked;
}

/**
 * Force unblock page (emergency)
 */
export function forceUnblockPage() {
    console.warn('Force unblocking page interactions');
    unblockPageInteractions();
    hideFloatingAlert();
}

// =====================================================
// PAGE TITLE WITH ROLE
// =====================================================

/**
 * Update page title with user role icon
 * @param {HTMLElement} titleElement
 * @param {Object} auth
 */
export function updateTitleWithRole(titleElement, auth) {
    if (!titleElement || !auth) return;

    const roleInfo = getRoleInfo(parseInt(auth.checkLogin));
    const baseTitle = titleElement.textContent.split(' - ')[0];

    titleElement.innerHTML = '';

    const titleText = document.createTextNode(`${baseTitle} - `);
    titleElement.appendChild(titleText);

    const iconSpan = document.createElement('span');
    iconSpan.className = 'role-icon';

    const roleClass = {
        0: 'admin',
        1: 'user',
        2: 'limited',
        3: 'basic',
        777: 'guest'
    }[parseInt(auth.checkLogin)] || 'default';

    iconSpan.classList.add(roleClass);
    iconSpan.textContent = roleInfo.icon;
    titleElement.appendChild(iconSpan);

    const userText = document.createTextNode(` ${auth.displayName || auth.username}`);
    titleElement.appendChild(userText);
}

/**
 * Initialize page title with role from localStorage
 */
export function initializePageTitle() {
    try {
        const authData = localStorage.getItem('loginindex_auth');
        if (!authData) return;

        const auth = JSON.parse(authData);
        const titleElement = document.querySelector('h1, .page-title, .header h1');

        if (titleElement && auth.checkLogin !== undefined) {
            updateTitleWithRole(titleElement, auth);
        }
    } catch (error) {
        console.error('[CommonUtils] Error updating page title:', error);
    }
}

/**
 * Display user info in container
 * @param {string} containerSelector
 */
export function displayUserInfo(containerSelector = '.user-info') {
    try {
        const authData = localStorage.getItem('loginindex_auth');
        if (!authData) return;

        const auth = JSON.parse(authData);
        const container = document.querySelector(containerSelector);

        if (container) {
            const roleInfo = getRoleInfo(parseInt(auth.checkLogin));
            container.innerHTML = `
                <span class="user-role-badge">
                    ${roleInfo.icon} ${auth.displayName || auth.username}
                    <small>(${roleInfo.text || roleInfo.name})</small>
                </span>
            `;
        }
    } catch (error) {
        console.error('[CommonUtils] Error displaying user info:', error);
    }
}

// =====================================================
// SETUP FUNCTIONS
// =====================================================

/**
 * Setup clipboard container drag & drop
 */
export function setupClipboardContainers() {
    const containers = ['container', 'containerKH'];
    containers.forEach(containerId => {
        const container = document.getElementById(containerId);
        if (!container) return;

        container.addEventListener('dragover', function(e) {
            e.preventDefault();
            this.style.borderColor = '#667eea';
            this.style.background = '#f0f4ff';
        });

        container.addEventListener('dragleave', function(e) {
            e.preventDefault();
            this.style.borderColor = '#ddd';
            this.style.background = '#f9f9f9';
        });

        container.addEventListener('drop', function(e) {
            e.preventDefault();
            this.style.borderColor = '#28a745';
            this.style.background = '#f8fff9';
            this.classList.add('has-content');
        });
    });
}

/**
 * Setup form monitoring
 */
export function setupFormMonitoring() {
    const form = document.querySelector('#dataForm form');
    if (!form) return;

    form.addEventListener('input', function() {
        const addButton = document.getElementById('addButton');
        const requiredFields = form.querySelectorAll('[required]');
        let allFilled = true;

        requiredFields.forEach(field => {
            if (!field.value.trim()) {
                allFilled = false;
            }
        });

        if (addButton) {
            addButton.style.opacity = allFilled ? '1' : '0.6';
        }
    });
}

/**
 * Setup security indicators
 */
export function setupSecurityIndicators() {
    const securityIndicator = document.getElementById('securityIndicator');
    if (securityIndicator && location.protocol !== 'https:') {
        securityIndicator.textContent = 'Insecure';
        securityIndicator.classList.add('insecure');
    }

    const performanceIndicator = document.getElementById('performanceIndicator');
    if (performanceIndicator) {
        performanceIndicator.style.display = 'block';
        setTimeout(() => {
            performanceIndicator.style.display = 'none';
        }, 3000);
    }
}

/**
 * Setup performance monitoring
 */
export function setupPerformanceMonitoring() {
    window.addEventListener('load', function() {
        if (performance?.timing) {
            const loadTime = performance.timing.loadEventEnd - performance.timing.navigationStart;
            console.log('Page load time:', loadTime + 'ms');

            if (loadTime < 2000) {
                showStatusMessage('Tải trang nhanh!', 'success');
            } else if (loadTime > 5000) {
                showStatusMessage('Tải trang chậm', 'error');
            }
        }
    });
}

/**
 * Setup global error handling
 */
export function setupErrorHandling() {
    window.addEventListener('error', function(e) {
        console.error('Global error:', e.error);
        showStatusMessage('Có lỗi xảy ra!', 'error');
    });

    window.addEventListener('unhandledrejection', function(e) {
        console.error('Unhandled promise rejection:', e.reason);
        showStatusMessage('Có lỗi xảy ra!', 'error');
    });
}

/**
 * Setup all common event handlers
 */
export function setupCommonEventHandlers() {
    setupClipboardContainers();
    setupFormMonitoring();
    setupSecurityIndicators();
}

/**
 * Initialize all common utilities
 */
export function initializeCommonUtils() {
    setupCommonEventHandlers();
    setupPerformanceMonitoring();
    setupErrorHandling();
    injectStyles();
    console.log('[CommonUtils] Initialized');
}

// =====================================================
// STYLE INJECTION
// =====================================================

/**
 * Inject required CSS styles
 */
export function injectStyles() {
    if (document.getElementById('commonUtilsStyles')) return;

    const styles = document.createElement('style');
    styles.id = 'commonUtilsStyles';
    styles.textContent = `
        /* Page blocked state */
        body.page-blocked {
            overflow: hidden;
            cursor: wait;
        }

        body.page-blocked * {
            cursor: wait !important;
        }

        /* Blocking overlay */
        .blocking-content {
            text-align: center;
            color: white;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }

        .blocking-spinner {
            width: 40px;
            height: 40px;
            border: 4px solid rgba(255, 255, 255, 0.3);
            border-radius: 50%;
            border-top-color: white;
            animation: blockingSpin 1s linear infinite;
            margin: 0 auto 15px;
        }

        .blocking-message {
            font-size: 16px;
            font-weight: 500;
            opacity: 0.9;
        }

        @keyframes blockingSpin {
            to { transform: rotate(360deg); }
        }

        #floatingAlert {
            z-index: 10000 !important;
        }

        #floatingAlert.loading {
            pointer-events: auto !important;
        }

        /* Role icon animations */
        .role-icon {
            display: inline-block;
            margin: 0 4px;
        }

        .user-role-badge {
            display: inline-flex;
            align-items: center;
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: white;
            padding: 8px 16px;
            border-radius: 20px;
            font-weight: 500;
        }

        .user-role-badge small {
            margin-left: 8px;
            opacity: 0.85;
        }
    `;

    document.head.appendChild(styles);
}

// =====================================================
// AUTO-INIT
// =====================================================

// Auto cleanup on page unload
if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', function() {
        if (FloatingAlertState.isPageBlocked) {
            forceUnblockPage();
        }
    });

    // Hide loading overlay on load
    window.addEventListener('load', function() {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) {
            overlay.classList.remove('show');
        }
    });
}

// =====================================================
// NAMESPACE EXPORT
// =====================================================

export const CommonUtils = {
    showStatusMessage,
    showFloatingAlert,
    hideFloatingAlert,
    showLoading,
    showSuccess,
    showError,
    isPageBlocked,
    forceUnblockPage,
    updateTitleWithRole,
    initializePageTitle,
    displayUserInfo,
    setupClipboardContainers,
    setupFormMonitoring,
    setupSecurityIndicators,
    setupPerformanceMonitoring,
    setupErrorHandling,
    setupCommonEventHandlers,
    init: initializeCommonUtils
};

console.log('[COMMON-UTILS] Module loaded');

export default CommonUtils;
