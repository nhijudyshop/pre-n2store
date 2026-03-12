/**
 * API Configuration
 * Central configuration for all API endpoints
 * Primary: Cloudflare Worker (no fallback)
 */

// Primary: Cloudflare Worker URL
const WORKER_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev';

// API Configuration
const API_CONFIG = {
    // Primary Worker URL
    WORKER_URL: WORKER_URL,

    // TPOS OData API (SaleOnline_Order, AuditLog, etc.)
    TPOS_ODATA: `${WORKER_URL}/api/odata`,

    // Pancake API (Pages, Conversations) - Via Cloudflare Worker proxy
    PANCAKE: `${WORKER_URL}/api/pancake`,

    // Helper functions
    buildUrl: {
        /**
         * Build TPOS OData URL
         * @param {string} endpoint - e.g., "SaleOnline_Order/ODataService.GetView"
         * @param {string} params - Query string (optional)
         * @returns {string} - Full URL through worker
         */
        tposOData: (endpoint, params = '') => {
            const baseUrl = `${WORKER_URL}/api/odata/${endpoint}`;
            return params ? `${baseUrl}?${params}` : baseUrl;
        },

        /**
         * Build Pancake API URL
         * @param {string} endpoint - e.g., "pages", "conversations"
         * @param {string} params - Query string (optional)
         * @returns {string} - Full URL via Cloudflare Worker proxy
         */
        pancake: (endpoint, params = '') => {
            const baseUrl = `${WORKER_URL}/api/pancake/${endpoint}`;
            return params ? `${baseUrl}?${params}` : baseUrl;
        },

        /**
         * Build Pancake Direct API URL (with custom Referer and JWT cookie)
         * Used for 24h policy bypass - fill_admin_name, check_inbox, contents/touch
         * @param {string} endpoint - e.g., "pages/123/check_inbox"
         * @param {string} pageId - Page ID for Referer mapping
         * @param {string} jwtToken - JWT token for Cookie header
         * @param {string} accessToken - Pancake access token
         * @returns {string} - Full URL via Cloudflare Worker proxy
         */
        pancakeDirect: (endpoint, pageId, jwtToken, accessToken) => {
            const params = new URLSearchParams();
            params.set('page_id', pageId);
            params.set('jwt', jwtToken);
            params.set('access_token', accessToken);
            return `${WORKER_URL}/api/pancake-direct/${endpoint}?${params.toString()}`;
        },

        /**
         * Build Pancake Official API URL (pages.fm Public API)
         * Uses page_access_token (from Settings → Tools, never expires)
         * @param {string} endpoint - e.g., "pages/123/conversations/456/messages"
         * @param {string} pageAccessToken - Page access token (from Pancake Settings → Tools)
         * @returns {string} - Full URL via Cloudflare Worker proxy
         */
        pancakeOfficial: (endpoint, pageAccessToken) => {
            const baseUrl = `${WORKER_URL}/api/pancake-official/${endpoint}`;
            return pageAccessToken ? `${baseUrl}?page_access_token=${pageAccessToken}` : baseUrl;
        },

        /**
         * Get Facebook Send API URL (for sending messages with message_tag)
         * Used to bypass 24h policy with POST_PURCHASE_UPDATE tag
         * @returns {string} - Full URL via Cloudflare Worker proxy
         */
        facebookSend: () => {
            return `${WORKER_URL}/api/facebook-send`;
        }
    },

    /**
     * Smart Fetch - simple wrapper around fetch
     * @param {string} url - Full URL
     * @param {object} options - Fetch options
     * @returns {Promise<Response>}
     */
    smartFetch: async function (url, options = {}) {
        return fetch(url, options);
    },

    /**
     * Get current server status
     */
    getStatus: function () {
        return {
            primary: WORKER_URL,
            current: WORKER_URL
        };
    }
};

// Export for use in other files
if (typeof window !== 'undefined') {
    window.API_CONFIG = API_CONFIG;
}

console.log('[API-CONFIG] API configuration loaded:', {
    worker: WORKER_URL,
    tposOData: API_CONFIG.TPOS_ODATA,
    pancake: API_CONFIG.PANCAKE
});
