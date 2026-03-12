// =====================================================
// TPOS CONFIG - Centralized Configuration
// =====================================================
// WRAPPER FILE - Backward compatibility layer
// SOURCE OF TRUTH: /shared/universal/tpos-client.js
//
// This file is kept for backward compatibility with existing code using:
//   <script src="../shared/js/tpos-config.js"></script>
//
// For new ES Module code, import directly from:
//   import { TPOSClient, TPOS_CONFIG } from '/shared/universal/tpos-client.js';

(function (global) {
    'use strict';

    const TPOS_CONFIG = {
        // =====================================================
        // API VERSION
        // =====================================================
        tposAppVersion: '5.12.29.1',

        // =====================================================
        // PROXY URL
        // =====================================================
        proxyUrl: 'https://chatomni-proxy.nhijudyshop.workers.dev',

        // =====================================================
        // TPOS API BASE
        // =====================================================
        tposBaseUrl: 'https://tomato.tpos.vn',

        // =====================================================
        // COMMON HEADERS
        // =====================================================
        getHeaders: function (token) {
            return {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'tposappversion': this.tposAppVersion,
                ...(token ? { 'Authorization': `Bearer ${token}` } : {})
            };
        },

        // Get just the version header
        getVersionHeader: function () {
            return {
                'tposappversion': this.tposAppVersion
            };
        }
    };

    // Export for different module systems
    if (typeof module !== 'undefined' && module.exports) {
        // Node.js / CommonJS
        module.exports = TPOS_CONFIG;
    } else if (typeof define === 'function' && define.amd) {
        // AMD
        define(function () { return TPOS_CONFIG; });
    } else {
        // Browser global
        global.TPOS_CONFIG = TPOS_CONFIG;
    }

})(typeof globalThis !== 'undefined' ? globalThis :
    typeof window !== 'undefined' ? window :
        typeof global !== 'undefined' ? global : this);
