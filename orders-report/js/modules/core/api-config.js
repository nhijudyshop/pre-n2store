/**
 * API Configuration - ES Module
 * Central configuration for all API endpoints
 * Primary: Cloudflare Worker
 *
 * NOTE: Uses centralized API_ENDPOINTS from /shared/universal/api-endpoints.js
 */

// Try to import from centralized endpoints, fallback to hardcoded
let WORKER_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev';

// Dynamic import for ES Module environments
try {
    // Check if running in ES Module context
    if (typeof window !== 'undefined' && window.API_ENDPOINTS?.WORKER?.URL) {
        WORKER_URL = window.API_ENDPOINTS.WORKER.URL;
    }
} catch (e) {
    // Fallback already set
}

/**
 * Get current server URL
 * @returns {string}
 */
export function getCurrentServerURL() {
    return WORKER_URL;
}

// API Configuration
export const API_CONFIG = {
    // Server URL
    WORKER_URL,

    // TPOS OData API
    get TPOS_ODATA() {
        return `${WORKER_URL}/api/odata`;
    },

    // Pancake API
    get PANCAKE() {
        return `${WORKER_URL}/api/pancake`;
    },

    // Helper functions
    buildUrl: {
        tposOData: (endpoint, params = '') => {
            const baseUrl = `${WORKER_URL}/api/odata/${endpoint}`;
            return params ? `${baseUrl}?${params}` : baseUrl;
        },

        pancake: (endpoint, params = '') => {
            const baseUrl = `${WORKER_URL}/api/pancake/${endpoint}`;
            return params ? `${baseUrl}?${params}` : baseUrl;
        },

        pancakeDirect: (endpoint, pageId, jwtToken, accessToken) => {
            const params = new URLSearchParams();
            params.set('page_id', pageId);
            params.set('jwt', jwtToken);
            params.set('access_token', accessToken);
            return `${WORKER_URL}/api/pancake-direct/${endpoint}?${params.toString()}`;
        },

        pancakeOfficial: (endpoint, pageAccessToken) => {
            const baseUrl = `${WORKER_URL}/api/pancake-official/${endpoint}`;
            return pageAccessToken ? `${baseUrl}?page_access_token=${pageAccessToken}` : baseUrl;
        },

        facebookSend: () => {
            return `${WORKER_URL}/api/facebook-send`;
        },

        facebookGraph: (path, accessToken, params = {}) => {
            const qs = new URLSearchParams({ path, access_token: accessToken, ...params });
            return `${WORKER_URL}/api/facebook-graph?${qs.toString()}`;
        }
    },

    /**
     * Simple Fetch wrapper
     */
    smartFetch: async function (url, options = {}) {
        return fetch(url, options);
    },

    getStatus: function () {
        return {
            primary: WORKER_URL,
            current: WORKER_URL
        };
    },

    getCurrentServer: getCurrentServerURL
};

console.log('[API-CONFIG] ES Module loaded:', {
    worker: WORKER_URL
});

export default API_CONFIG;
