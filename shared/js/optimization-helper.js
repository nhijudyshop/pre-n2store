/**
 * OPTIMIZATION HELPER
 * File: optimization-helper.js
 * Purpose: Helper functions để apply optimizations vào code hiện có
 * WITHOUT breaking existing functionality
 */

(function() {
    'use strict';

    const OptimizationHelper = {
        /**
         * Wrap console.log calls với logger (backward compatible)
         */
        enableProductionLogger() {
            // Logger đã được enable qua logger.js
            // Just verify it's working
            if (window.logger) {
                console.log('✅ Production logger enabled');
                return true;
            }
            return false;
        },

        /**
         * Replace innerHTML usage với safe alternatives
         * @param {HTMLElement} element
         * @param {string} content
         * @param {boolean} isHTML - true nếu cần render HTML, false nếu chỉ text
         */
        safeSetContent(element, content, isHTML = false) {
            if (!element) return;

            if (isHTML && window.DOMUtils) {
                DOMUtils.setHTML(element, content);
            } else if (window.DOMUtils) {
                DOMUtils.setText(element, content);
            } else {
                // Fallback if DOMUtils not loaded
                if (isHTML) {
                    element.innerHTML = content;
                } else {
                    element.textContent = content;
                }
            }
        },

        /**
         * Safe event listener registration
         * @param {HTMLElement} element
         * @param {string} event
         * @param {Function} handler
         * @param {object} options
         * @returns {number|null} Listener ID
         */
        addListener(element, event, handler, options = {}) {
            if (window.eventManager) {
                return eventManager.add(element, event, handler, options);
            } else {
                // Fallback
                element.addEventListener(event, handler, options);
                return null;
            }
        },

        /**
         * Remove event listener
         * @param {number|null} listenerId
         */
        removeListener(listenerId) {
            if (window.eventManager && listenerId) {
                return eventManager.remove(listenerId);
            }
            return false;
        },

        /**
         * Create cache manager instance for module
         * @param {string} moduleName
         * @param {object} config
         */
        createCacheManager(moduleName, config = {}) {
            if (window.PersistentCacheManager) {
                return new PersistentCacheManager({
                    storageKey: `${moduleName}_cache`,
                    CACHE_EXPIRY: config.CACHE_EXPIRY || 24 * 60 * 60 * 1000,
                    ...config
                });
            }
            return null;
        },

        /**
         * Create auth manager instance for module
         * @param {string} pageName
         * @param {object} config
         */
        createAuthManager(pageName, config = {}) {
            if (window.AuthManager) {
                return new AuthManager({
                    storageKey: config.storageKey || 'loginindex_auth',
                    redirectUrl: config.redirectUrl || '/index.html',
                    requiredPermissions: [pageName],
                    ...config
                });
            }
            return null;
        },

        /**
         * Get Firebase config from centralized source
         */
        getFirebaseConfig() {
            return window.FIREBASE_CONFIG || null;
        },

        /**
         * Initialize Firebase with centralized config
         */
        initFirebase() {
            if (typeof firebase === 'undefined') {
                console.error('Firebase SDK not loaded');
                return null;
            }

            const config = this.getFirebaseConfig();
            if (!config) {
                console.error('Firebase config not found');
                return null;
            }

            // Check if already initialized
            try {
                return firebase.app();
            } catch (e) {
                return firebase.initializeApp(config);
            }
        },

        /**
         * Setup page cleanup on unload (prevent memory leaks)
         */
        setupPageCleanup(cleanupFunction) {
            if (window.eventManager) {
                // EventManager already handles cleanup
                if (typeof cleanupFunction === 'function') {
                    window.addEventListener('beforeunload', cleanupFunction);
                }
            } else {
                if (typeof cleanupFunction === 'function') {
                    window.addEventListener('beforeunload', cleanupFunction);
                }
            }
        },

        /**
         * Migrate từ console.log sang logger
         */
        patchConsole() {
            // Already patched in logger.js nếu production
            return window.logger ? true : false;
        },

        /**
         * Check if all optimizations are loaded
         */
        isOptimized() {
            return !!(
                window.logger &&
                window.DOMUtils &&
                window.eventManager &&
                window.PersistentCacheManager &&
                window.AuthManager &&
                window.FIREBASE_CONFIG
            );
        },

        /**
         * Get optimization status
         */
        getOptimizationStatus() {
            return {
                logger: !!window.logger,
                domUtils: !!window.DOMUtils,
                eventManager: !!window.eventManager,
                cacheManager: !!window.PersistentCacheManager,
                authManager: !!window.AuthManager,
                firebaseConfig: !!window.FIREBASE_CONFIG,
                allLoaded: this.isOptimized()
            };
        },

        /**
         * Print optimization report to console
         */
        printOptimizationReport() {
            console.log('='.repeat(60));
            console.log('N2STORE OPTIMIZATION REPORT');
            console.log('='.repeat(60));

            const status = this.getOptimizationStatus();
            for (const [key, value] of Object.entries(status)) {
                const icon = value ? '✅' : '❌';
                console.log(`${icon} ${key}: ${value}`);
            }

            if (window.eventManager) {
                const stats = eventManager.getStats();
                console.log('\nEvent Listeners:', stats.total);
                console.log('By Event Type:', stats.byEvent);
            }

            console.log('='.repeat(60));
        }
    };

    // Export to window
    window.OptimizationHelper = OptimizationHelper;

    // Auto-print report when loaded
    if (window.CORE_UTILITIES_LOADED) {
        OptimizationHelper.printOptimizationReport();
    } else {
        document.addEventListener('coreUtilitiesLoaded', () => {
            OptimizationHelper.printOptimizationReport();
        });
    }

})();
