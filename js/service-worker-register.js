/**
 * SERVICE WORKER REGISTRATION
 * File: service-worker-register.js
 * Purpose: Register service worker cho offline support
 */

(function() {
    'use strict';

    // Check if service workers are supported
    if (!('serviceWorker' in navigator)) {
        console.warn('Service Workers not supported in this browser');
        return;
    }

    // Register service worker when page loads
    window.addEventListener('load', () => {
        registerServiceWorker();
    });

    function registerServiceWorker() {
        navigator.serviceWorker.register('/service-worker.js')
            .then((registration) => {
                console.log('✅ ServiceWorker registered:', registration.scope);

                // Check for updates
                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    console.log('🔄 ServiceWorker update found');

                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            // New service worker available
                            console.log('✅ New ServiceWorker installed, reload to activate');
                            showUpdateNotification();
                        }
                    });
                });
            })
            .catch((error) => {
                console.error('❌ ServiceWorker registration failed:', error);
            });
    }

    // Show notification when update is available
    function showUpdateNotification() {
        // Use floating alert if available
        if (typeof showFloatingAlert === 'function') {
            showFloatingAlert('Có phiên bản mới! Tải lại trang để cập nhật.', 'info', 5000);
        } else {
            // Fallback to console
            console.log('💡 New version available! Please reload the page.');
        }
    }

    // Clear cache function (expose globally)
    window.clearServiceWorkerCache = function() {
        if (!navigator.serviceWorker.controller) {
            console.warn('No service worker controller');
            return Promise.reject('No service worker');
        }

        return new Promise((resolve, reject) => {
            const messageChannel = new MessageChannel();

            messageChannel.port1.onmessage = (event) => {
                if (event.data.success) {
                    console.log('✅ Service worker cache cleared');
                    resolve();
                } else {
                    reject(new Error('Failed to clear cache'));
                }
            };

            navigator.serviceWorker.controller.postMessage(
                { type: 'CLEAR_CACHE' },
                [messageChannel.port2]
            );
        });
    };

    // Unregister service worker (for debugging)
    window.unregisterServiceWorker = function() {
        return navigator.serviceWorker.getRegistrations().then((registrations) => {
            const promises = registrations.map(registration => registration.unregister());
            return Promise.all(promises);
        }).then(() => {
            console.log('✅ All service workers unregistered');
        });
    };

})();
