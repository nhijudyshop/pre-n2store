/**
 * PRODUCTION-SAFE LOGGER
 * File: logger.js
 *
 * WRAPPER FILE - Backward compatibility layer
 * SOURCE OF TRUTH: /shared/browser/logger.js
 *
 * This file is kept for backward compatibility with existing code using:
 *   <script src="../shared/js/logger.js"></script>
 *
 * For new ES Module code, import directly from:
 *   import { Logger, logger } from '/shared/browser/logger.js';
 */

// Detect environment
const IS_PRODUCTION = window.location.hostname !== 'localhost' &&
                     window.location.hostname !== '127.0.0.1' &&
                     !window.location.hostname.includes('192.168.');

// Logger class
class Logger {
    constructor(enabled = !IS_PRODUCTION) {
        this.enabled = enabled;
    }

    log(...args) {
        if (this.enabled) {
            console.log(...args);
        }
    }

    warn(...args) {
        if (this.enabled) {
            console.warn(...args);
        }
    }

    error(...args) {
        // Always show errors, even in production
        console.error(...args);
    }

    info(...args) {
        if (this.enabled) {
            console.info(...args);
        }
    }

    debug(...args) {
        if (this.enabled) {
            console.debug(...args);
        }
    }

    // Force enable/disable
    enable() {
        this.enabled = true;
    }

    disable() {
        this.enabled = false;
    }

    // Toggle
    toggle() {
        this.enabled = !this.enabled;
    }
}

// Global logger instance
const logger = new Logger();

// Expose to window
if (typeof window !== 'undefined') {
    window.logger = logger;
    window.Logger = Logger;

    // Backward compatibility - override console in production
    if (IS_PRODUCTION) {
        const originalLog = console.log;
        const originalWarn = console.warn;
        const originalInfo = console.info;
        const originalDebug = console.debug;

        console.log = (...args) => logger.log(...args);
        console.warn = (...args) => logger.warn(...args);
        console.info = (...args) => logger.info(...args);
        console.debug = (...args) => logger.debug(...args);

        // Keep original references for debugging
        console._original = {
            log: originalLog,
            warn: originalWarn,
            info: originalInfo,
            debug: originalDebug
        };
    }
}

// Module export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Logger, logger };
}
