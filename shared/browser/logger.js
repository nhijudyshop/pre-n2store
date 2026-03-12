/**
 * PRODUCTION-SAFE LOGGER
 * SOURCE OF TRUTH - Console wrapper that disables logs in production
 *
 * @module shared/browser/logger
 * @description Logger that automatically disables in production environments
 */

// =====================================================
// ENVIRONMENT DETECTION
// =====================================================

/**
 * Check if running in production environment
 * @returns {boolean}
 */
export function isProduction() {
    if (typeof window === 'undefined') return true;

    const hostname = window.location?.hostname || '';
    return hostname !== 'localhost' &&
           hostname !== '127.0.0.1' &&
           !hostname.includes('192.168.') &&
           !hostname.includes('.local');
}

// =====================================================
// LOGGER CLASS
// =====================================================

export class Logger {
    constructor(options = {}) {
        this.enabled = options.enabled !== undefined
            ? options.enabled
            : !isProduction();
        this.prefix = options.prefix || '';
        this.showTimestamp = options.showTimestamp || false;
    }

    /**
     * Format message with optional prefix and timestamp
     * @private
     */
    _format(...args) {
        const parts = [];

        if (this.showTimestamp) {
            parts.push(`[${new Date().toLocaleTimeString()}]`);
        }

        if (this.prefix) {
            parts.push(`[${this.prefix}]`);
        }

        return [...parts, ...args];
    }

    /**
     * Log message (disabled in production)
     */
    log(...args) {
        if (this.enabled) {
            console.log(...this._format(...args));
        }
    }

    /**
     * Warning message (disabled in production)
     */
    warn(...args) {
        if (this.enabled) {
            console.warn(...this._format(...args));
        }
    }

    /**
     * Error message (always shown)
     */
    error(...args) {
        // Always show errors, even in production
        console.error(...this._format(...args));
    }

    /**
     * Info message (disabled in production)
     */
    info(...args) {
        if (this.enabled) {
            console.info(...this._format(...args));
        }
    }

    /**
     * Debug message (disabled in production)
     */
    debug(...args) {
        if (this.enabled) {
            console.debug(...this._format(...args));
        }
    }

    /**
     * Group start
     */
    group(label) {
        if (this.enabled) {
            console.group(this.prefix ? `[${this.prefix}] ${label}` : label);
        }
    }

    /**
     * Group end
     */
    groupEnd() {
        if (this.enabled) {
            console.groupEnd();
        }
    }

    /**
     * Table output
     */
    table(data) {
        if (this.enabled) {
            console.table(data);
        }
    }

    /**
     * Time tracking start
     */
    time(label) {
        if (this.enabled) {
            console.time(this.prefix ? `[${this.prefix}] ${label}` : label);
        }
    }

    /**
     * Time tracking end
     */
    timeEnd(label) {
        if (this.enabled) {
            console.timeEnd(this.prefix ? `[${this.prefix}] ${label}` : label);
        }
    }

    // =====================================================
    // CONTROL METHODS
    // =====================================================

    /**
     * Enable logging
     */
    enable() {
        this.enabled = true;
    }

    /**
     * Disable logging
     */
    disable() {
        this.enabled = false;
    }

    /**
     * Toggle logging
     */
    toggle() {
        this.enabled = !this.enabled;
    }

    /**
     * Check if enabled
     * @returns {boolean}
     */
    isEnabled() {
        return this.enabled;
    }

    /**
     * Create child logger with prefix
     * @param {string} prefix
     * @returns {Logger}
     */
    child(prefix) {
        const childPrefix = this.prefix
            ? `${this.prefix}:${prefix}`
            : prefix;
        return new Logger({
            enabled: this.enabled,
            prefix: childPrefix,
            showTimestamp: this.showTimestamp
        });
    }
}

// =====================================================
// FACTORY FUNCTIONS
// =====================================================

/**
 * Create new Logger instance
 * @param {Object} options
 * @returns {Logger}
 */
export function createLogger(options = {}) {
    return new Logger(options);
}

// =====================================================
// SINGLETON INSTANCE
// =====================================================

// Global logger instance
export const logger = new Logger();

// =====================================================
// CONSOLE OVERRIDE (Optional)
// =====================================================

/**
 * Override console methods in production
 * Call this function if you want to suppress ALL console logs in production
 */
export function overrideConsoleInProduction() {
    if (!isProduction()) return;

    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalInfo = console.info;
    const originalDebug = console.debug;

    console.log = () => {};
    console.warn = () => {};
    console.info = () => {};
    console.debug = () => {};

    // Keep original references for debugging
    console._original = {
        log: originalLog,
        warn: originalWarn,
        info: originalInfo,
        debug: originalDebug
    };

    // Restore function
    console._restore = function() {
        console.log = originalLog;
        console.warn = originalWarn;
        console.info = originalInfo;
        console.debug = originalDebug;
    };
}

console.log('[LOGGER] Module loaded, production mode:', isProduction());

export default logger;
