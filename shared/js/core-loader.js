/**
 * CORE UTILITIES LOADER
 * File: core-loader.js
 * Purpose: Load tất cả các core utilities theo đúng thứ tự
 *
 * USAGE: Add vào HTML trước tất cả các script khác:
 * <script src="/shared/js/core-loader.js"></script>
 */

(function () {
    'use strict';

    // Detect base path
    const scripts = document.getElementsByTagName('script');
    const currentScript = scripts[scripts.length - 1];
    const basePath = currentScript.src.substring(0, currentScript.src.lastIndexOf('/')) + '/';

    // console.log('🚀 Loading N2Store Core Utilities...');

    // List of core utilities to load in order
    const coreUtilities = [
        'logger.js',                    // Load logger first (needed by others)
        'firebase-config.js',           // Firebase config
        'date-utils.js',                // Date formatting utilities
        'form-utils.js',                // Form/input utilities
        'dom-utils.js',                 // DOM utilities
        'event-manager.js',             // Event management
        'shared-cache-manager.js',      // Cache manager
        'shared-auth-manager.js',       // Auth manager
        'permissions-helper.js'         // Global permission system
    ];

    // Track loaded scripts
    let loadedCount = 0;
    const totalCount = coreUtilities.length;

    // Load scripts sequentially
    function loadScript(index) {
        if (index >= coreUtilities.length) {
            onAllLoaded();
            return;
        }

        const scriptUrl = basePath + coreUtilities[index];
        const script = document.createElement('script');
        script.src = scriptUrl;

        script.onload = function () {
            loadedCount++;
            // console.log(`✅ Loaded: ${coreUtilities[index]} (${loadedCount}/${totalCount})`);
            loadScript(index + 1);
        };

        script.onerror = function () {
            console.error(`❌ Failed to load: ${coreUtilities[index]}`);
            // Continue loading next script even if one fails
            loadScript(index + 1);
        };

        document.head.appendChild(script);
    }

    // Called when all scripts are loaded
    function onAllLoaded() {
        // console.log('✅ All core utilities loaded successfully!');

        // Trigger custom event
        const event = new CustomEvent('coreUtilitiesLoaded', {
            detail: {
                loadedCount,
                totalCount,
                timestamp: Date.now()
            }
        });
        document.dispatchEvent(event);

        // Set global flag
        window.CORE_UTILITIES_LOADED = true;
    }

    // Start loading
    loadScript(0);
})();
