// =====================================================
// MODULE LOADER - Lazy loading và preloading cho ES modules
// Script-tag compatible (IIFE pattern)
//
// Cung cấp:
//   - load(modulePath): Dynamic import() cho lazy loading
//   - preload(modulePaths): requestIdleCallback + modulepreload links
//
// Yêu cầu: 4.4
// =====================================================

(function () {
    'use strict';

    var ModuleLoader = {
        /**
         * Lazy load một module khi cần
         * @param {string} modulePath - Đường dẫn module ES
         * @returns {Promise<*>} Module đã load
         */
        load: function (modulePath) {
            return import(modulePath);
        },

        /**
         * Preload các modules khi browser idle
         * Tạo <link rel="modulepreload"> tags trong document head
         * @param {string[]} modulePaths - Danh sách đường dẫn modules cần preload
         */
        preload: function (modulePaths) {
            if (!Array.isArray(modulePaths) || modulePaths.length === 0) {
                return;
            }

            var addPreloadLinks = function () {
                modulePaths.forEach(function (path) {
                    var link = document.createElement('link');
                    link.rel = 'modulepreload';
                    link.href = path;
                    document.head.appendChild(link);
                });
            };

            if ('requestIdleCallback' in window) {
                requestIdleCallback(addPreloadLinks);
            } else {
                // Fallback cho browsers không hỗ trợ requestIdleCallback
                setTimeout(addPreloadLinks, 1);
            }
        }
    };

    // =====================================================
    // EXPORTS
    // =====================================================

    if (typeof window !== 'undefined') {
        window.ModuleLoader = ModuleLoader;
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = ModuleLoader;
    }

})();
