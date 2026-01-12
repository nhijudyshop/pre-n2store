// =====================================================
// TPOS CONFIG - Centralized Configuration
// =====================================================
// Single source of truth for TPOS API configuration.
// All files should import from here instead of hardcoding values.

(function (global) {
    'use strict';

    const TPOS_CONFIG = {
        // =====================================================
        // API VERSION - Dynamically fetched from server
        // =====================================================
        tposAppVersion: null, // Will be fetched dynamically
        _fallbackVersion: '5.12.29.1', // Fallback only if dynamic fetch fails

        // =====================================================
        // PROXY URLS
        // =====================================================
        proxyUrl: 'https://chatomni-proxy.nhijudyshop.workers.dev',
        fallbackApiUrl: 'https://n2store-fallback.onrender.com',

        // =====================================================
        // TPOS API BASE
        // =====================================================
        tposBaseUrl: 'https://tomato.tpos.vn',

        // =====================================================
        // DYNAMIC HEADERS FETCH
        // =====================================================
        async fetchDynamicHeaders() {
            try {
                const response = await fetch(`${this.fallbackApiUrl}/dynamic-headers`);
                const data = await response.json();
                if (data.success && data.data.currentHeaders.tposappversion) {
                    this.tposAppVersion = data.data.currentHeaders.tposappversion;
                    console.log('[TPOS-CONFIG] ✅ Dynamic headers loaded:', this.tposAppVersion);
                } else {
                    this.tposAppVersion = this._fallbackVersion;
                    console.log('[TPOS-CONFIG] ⚠️ Using fallback version:', this._fallbackVersion);
                }
            } catch (error) {
                this.tposAppVersion = this._fallbackVersion;
                console.log('[TPOS-CONFIG] ⚠️ Failed to fetch dynamic headers, using fallback:', this._fallbackVersion);
            }
        },

        // =====================================================
        // COMMON HEADERS
        // =====================================================
        getHeaders: function (token) {
            return {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'tposappversion': this.tposAppVersion || this._fallbackVersion,
                ...(token ? { 'Authorization': `Bearer ${token}` } : {})
            };
        },

        // Get just the version header
        getVersionHeader: function () {
            return {
                'tposappversion': this.tposAppVersion || this._fallbackVersion
            };
        }
    };

    // Initialize dynamic headers on load
    if (typeof window !== 'undefined') {
        TPOS_CONFIG.fetchDynamicHeaders();
    }

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
